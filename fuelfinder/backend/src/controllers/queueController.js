const mongoose = require("mongoose");
const crypto = require("crypto");
const QueueTicket = require("../models/QueueTicket");
const Station = require("../models/Station");
const { getIO } = require("../socket");
const {
  requestAuthToken,
  createTelebirrCheckout,
  verifyTelebirrWebhookSignature
} = require("../services/telebirr");

const ACTIVE_STATUSES = ["pending_payment", "waiting", "called"];
const AVERAGE_MINUTES_PER_CAR = 3;
const PAYMENT_WINDOW_MINUTES = 10;
const CALL_WINDOW_MINUTES = 5;
const CHECKIN_RADIUS_METERS = 250;
const CHECKIN_MAX_ACCURACY_METERS = 120;
const CHECKIN_OTP_TTL_SECONDS = 300;
const CHECKIN_MAX_OTP_ATTEMPTS = 5;
const RESERVATION_BAND_DEPOSITS = {
  "10-20": 100,
  "20-40": 200,
  "40+": 300
};

function stationRoom(stationId) {
  return `station:${stationId}`;
}

function emitQueueUpdated(stationId) {
  const io = getIO();
  if (!io) return;
  io.to(stationRoom(stationId)).emit("queue_updated", { stationId: String(stationId) });
}

function isObjectId(value) {
  return mongoose.Types.ObjectId.isValid(value);
}

async function canOperateStation(user, stationId) {
  if (!user) return false;
  if (String(user.role || "") === "super_admin") return true;

  const allowedStationIds = Array.isArray(user.stationIds) ? user.stationIds.map(String) : [];
  if (allowedStationIds.length) {
    return allowedStationIds.includes(String(stationId));
  }

  // If user has no explicit station restriction, evaluate optional broader scope.
  // This keeps behavior aligned with requireScope middleware while supporting future station metadata.
  const station = await Station.findById(stationId)
    .select("_id organizationId cityId branchId")
    .lean();
  if (!station) return false;

  const userOrganizationId = String(user.organizationId || "");
  const userCityIds = Array.isArray(user.cityIds) ? user.cityIds.map(String) : [];
  const userBranchIds = Array.isArray(user.branchIds) ? user.branchIds.map(String) : [];

  if (userOrganizationId && station.organizationId) {
    if (String(station.organizationId) !== userOrganizationId) return false;
  }
  if (userCityIds.length && station.cityId) {
    if (!userCityIds.includes(String(station.cityId))) return false;
  }
  if (userBranchIds.length && station.branchId) {
    if (!userBranchIds.includes(String(station.branchId))) return false;
  }

  return true;
}

async function recalculatePositions(stationId) {
  const waiting = await QueueTicket.find({
    stationId,
    status: "waiting"
  })
    .sort({ joinedAt: 1, _id: 1 })
    .select("_id position")
    .lean();

  const bulkOps = waiting
    .map((ticket, idx) => {
      const nextPosition = idx + 1;
      if (ticket.position === nextPosition) return null;
      return {
        updateOne: {
          filter: { _id: ticket._id },
          update: { $set: { position: nextPosition } }
        }
      };
    })
    .filter(Boolean);

  if (bulkOps.length > 0) {
    await QueueTicket.bulkWrite(bulkOps);
  }
}

async function expireStaleTickets(stationId) {
  const now = new Date();
  const filter = stationId ? { stationId } : {};

  await QueueTicket.updateMany(
    {
      ...filter,
      status: "pending_payment",
      paymentExpiresAt: { $lte: now }
    },
    {
      $set: {
        status: "expired"
      }
    }
  );

  await QueueTicket.updateMany(
    {
      ...filter,
      status: "called",
      expiresAt: { $lte: now }
    },
    {
      $set: {
        status: "expired",
        depositStatus: "forfeited"
      }
    }
  );
}

function resolveRequestedBand(value) {
  const band = String(value || "").trim();
  if (Object.prototype.hasOwnProperty.call(RESERVATION_BAND_DEPOSITS, band)) return band;
  return null;
}

function resolveFuelType(value) {
  const fuelType = String(value || "").trim().toLowerCase();
  if (!fuelType) return "gasoline";
  if (["gasoline", "diesel", "other"].includes(fuelType)) return fuelType;
  return null;
}

function resolveRequestedLiters(value) {
  const liters = Number(value);
  if (!Number.isFinite(liters)) return null;
  if (liters <= 0 || liters > 1000) return null;
  return Number(liters.toFixed(2));
}

function resolveUnitPrice(value) {
  const price = Number(value);
  if (!Number.isFinite(price)) return null;
  if (price < 0 || price > 100000) return null;
  return Number(price.toFixed(2));
}

function toRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

function haversineDistanceMeters(fromLat, fromLon, toLat, toLon) {
  const earthRadius = 6371000;
  const dLat = toRadians(toLat - fromLat);
  const dLon = toRadians(toLon - fromLon);
  const lat1 = toRadians(fromLat);
  const lat2 = toRadians(toLat);

  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadius * c;
}

function generateOtpCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function hashOtpCode(code) {
  return crypto.createHash("sha256").update(String(code || ""), "utf8").digest("hex");
}

function getCheckInSecret() {
  return String(process.env.CHECKIN_TOKEN_SECRET || process.env.JWT_ACCESS_SECRET || "fuelfinder-checkin-secret");
}

function base64urlEncode(text) {
  return Buffer.from(text, "utf8").toString("base64url");
}

function base64urlDecode(text) {
  return Buffer.from(text, "base64url").toString("utf8");
}

function signCheckInPayload(payloadString) {
  return crypto.createHmac("sha256", getCheckInSecret()).update(payloadString, "utf8").digest("base64url");
}

function buildCheckInQrToken(payload) {
  const payloadString = JSON.stringify(payload);
  const encodedPayload = base64urlEncode(payloadString);
  const signature = signCheckInPayload(payloadString);
  return `${encodedPayload}.${signature}`;
}

function verifyCheckInQrToken(token) {
  const [encodedPayload, providedSignature] = String(token || "").split(".");
  if (!encodedPayload || !providedSignature) return null;
  const payloadString = base64urlDecode(encodedPayload);
  const expectedSignature = signCheckInPayload(payloadString);
  if (expectedSignature.length !== providedSignature.length) return null;
  const valid = crypto.timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(providedSignature));
  if (!valid) return null;
  const payload = JSON.parse(payloadString);
  if (!payload?.exp || Number(payload.exp) * 1000 < Date.now()) return null;
  return payload;
}

async function activatePaidTicket(ticket, paymentReference, paymentSessionId) {
  const queueCount = await QueueTicket.countDocuments({
    stationId: ticket.stationId,
    status: "waiting"
  });

  ticket.status = "waiting";
  ticket.position = queueCount + 1;
  ticket.paymentReference = String(paymentReference || ticket.paymentReference || "").trim();
  ticket.paymentSessionId = String(paymentSessionId || ticket.paymentSessionId || "").trim();
  ticket.paymentProvider = "telebirr";
  ticket.depositStatus = ticket.depositAmount > 0 ? "authorized" : "not_required";
  ticket.depositPaidAt = new Date();
  ticket.joinedAt = new Date();
  await ticket.save();

  emitQueueUpdated(ticket.stationId);
  return ticket;
}

exports.reserveQueueSlot = async (req, res) => {
  try {
    const userId = req.user.id;
    const { stationId } = req.body;
    const requestedBand = resolveRequestedBand(req.body.requestedBand);
    const fuelType = resolveFuelType(req.body.fuelType);
    const requestedLiters = resolveRequestedLiters(req.body.requestedLiters);
    const unitPrice = resolveUnitPrice(req.body.unitPrice);

    if (!isObjectId(userId) || !isObjectId(stationId)) {
      return res.status(400).json({ message: "Invalid userId or stationId." });
    }
    if (!requestedBand) {
      return res.status(400).json({ message: "requestedBand must be one of: 10-20, 20-40, 40+." });
    }
    if (!fuelType) {
      return res.status(400).json({ message: "fuelType must be one of: gasoline, diesel, other." });
    }
    if (requestedLiters === null) {
      return res.status(400).json({ message: "requestedLiters must be a number between 1 and 1000." });
    }
    if (unitPrice === null) {
      return res.status(400).json({ message: "unitPrice must be a non-negative number." });
    }

    await expireStaleTickets(stationId);

    const existing = await QueueTicket.findOne({
      userId,
      stationId,
      status: { $in: ACTIVE_STATUSES }
    });
    if (existing) {
      return res.status(409).json({
        message: "You already have an active reservation/ticket for this station.",
        ticketId: existing._id,
        status: existing.status,
        position: existing.position
      });
    }

    const depositAmount = RESERVATION_BAND_DEPOSITS[requestedBand];
    const estimatedAmount = Number((requestedLiters * unitPrice).toFixed(2));
    const paymentExpiresAt = new Date(Date.now() + PAYMENT_WINDOW_MINUTES * 60 * 1000);

    const ticket = await QueueTicket.create({
      userId,
      stationId,
      status: "pending_payment",
      position: 0,
      fuelType,
      requestedLiters,
      unitPrice,
      estimatedAmount,
      requestedBand,
      depositAmount,
      depositStatus: depositAmount > 0 ? "pending" : "not_required",
      paymentExpiresAt
    });

    return res.status(201).json({
      reservationId: ticket._id,
      stationId,
      status: ticket.status,
      requestedBand: ticket.requestedBand,
      fuelType: ticket.fuelType,
      requestedLiters: ticket.requestedLiters,
      unitPrice: ticket.unitPrice,
      estimatedAmount: ticket.estimatedAmount,
      depositAmount: ticket.depositAmount,
      depositCurrency: ticket.depositCurrency,
      paymentExpiresAt: ticket.paymentExpiresAt
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to reserve queue slot." });
  }
};

exports.joinQueue = async (req, res) => {
  try {
    const userId = req.user.id;
    const { stationId } = req.body;

    if (!isObjectId(userId) || !isObjectId(stationId)) {
      return res.status(400).json({ message: "Invalid userId or stationId." });
    }

    await expireStaleTickets(stationId);

    const existing = await QueueTicket.findOne({
      userId,
      stationId,
      status: { $in: ACTIVE_STATUSES }
    });
    if (existing) {
      return res.status(409).json({
        message: "You already have an active ticket for this station.",
        ticketId: existing._id,
        position: existing.position
      });
    }

    const queueCount = await QueueTicket.countDocuments({
      stationId,
      status: "waiting"
    });
    const position = queueCount + 1;

    const ticket = await QueueTicket.create({
      userId,
      stationId,
      status: "waiting",
      position,
      depositStatus: "not_required"
    });

    const etaMinutes = position * AVERAGE_MINUTES_PER_CAR;
    emitQueueUpdated(stationId);

    return res.status(201).json({
      ticketId: ticket._id,
      stationId,
      position,
      status: ticket.status,
      etaMinutes
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to join queue." });
  }
};

exports.confirmReservationPayment = async (req, res) => {
  try {
    const userId = req.user.id;
    const { reservationId, paymentReference } = req.body;

    if (!isObjectId(userId) || !isObjectId(reservationId)) {
      return res.status(400).json({ message: "Invalid userId or reservationId." });
    }

    const paymentRef = String(paymentReference || "").trim();
    if (!paymentRef) {
      return res.status(400).json({ message: "paymentReference is required." });
    }

    const ticket = await QueueTicket.findOne({
      _id: reservationId,
      userId,
      status: "pending_payment"
    });
    if (!ticket) {
      return res.status(404).json({ message: "Pending reservation not found." });
    }

    if (ticket.paymentExpiresAt && ticket.paymentExpiresAt <= new Date()) {
      ticket.status = "expired";
      await ticket.save();
      return res.status(410).json({ message: "Reservation payment window expired." });
    }

    await activatePaidTicket(ticket, paymentRef, ticket.paymentSessionId);

    const etaMinutes = ticket.position * AVERAGE_MINUTES_PER_CAR;
    return res.json({
      ticketId: ticket._id,
      reservationId: ticket._id,
      stationId: ticket.stationId,
      status: ticket.status,
      position: ticket.position,
      etaMinutes,
      depositStatus: ticket.depositStatus
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to confirm payment." });
  }
};

exports.startTelebirrCheckout = async (req, res) => {
  try {
    const userId = req.user.id;
    const { reservationId } = req.body;

    if (!isObjectId(userId) || !isObjectId(reservationId)) {
      return res.status(400).json({ message: "Invalid userId or reservationId." });
    }

    const ticket = await QueueTicket.findOne({
      _id: reservationId,
      userId,
      status: "pending_payment"
    });
    if (!ticket) {
      return res.status(404).json({ message: "Pending reservation not found." });
    }
    if (ticket.paymentExpiresAt && ticket.paymentExpiresAt <= new Date()) {
      ticket.status = "expired";
      await ticket.save();
      return res.status(410).json({ message: "Reservation payment window expired." });
    }

    const checkout = await createTelebirrCheckout({
      amount: ticket.depositAmount,
      currency: ticket.depositCurrency,
      description: `Queue deposit for station ${ticket.stationId}`,
      metadata: {
        reservationId: String(ticket._id),
        userId: String(ticket.userId),
        stationId: String(ticket.stationId)
      }
    });

    ticket.paymentProvider = "telebirr";
    ticket.paymentSessionId = checkout.prepayId || "";
    ticket.paymentReference = checkout.merchantOrderId;
    await ticket.save();

    return res.json({
      reservationId: ticket._id,
      paymentProvider: "telebirr",
      merchantOrderId: checkout.merchantOrderId,
      prepayId: checkout.prepayId,
      rawRequest: checkout.rawRequest,
      gatewayResponse: checkout.gatewayResponse
    });
  } catch (error) {
    console.error("[Telebirr:startTelebirrCheckout]", {
      message: error?.message,
      stack: error?.stack
    });
    return res.status(500).json({
      message: "Failed to start Telebirr checkout.",
      ...(process.env.NODE_ENV !== "production" ? { detail: error?.message || "unknown error" } : {})
    });
  }
};

exports.exchangeTelebirrAuthToken = async (req, res) => {
  try {
    const appToken = String(req.body.authToken || "").trim();
    if (!appToken) {
      return res.status(400).json({ message: "authToken is required." });
    }

    const result = await requestAuthToken(appToken);
    return res.json(result);
  } catch (error) {
    console.error("[Telebirr:exchangeAuthToken]", {
      message: error?.message,
      stack: error?.stack
    });
    return res.status(500).json({ message: "Failed to exchange Telebirr auth token." });
  }
};

exports.handleTelebirrWebhook = async (req, res) => {
  try {
    const signature =
      req.headers["x-telebirr-signature"] ||
      req.headers["x-signature"] ||
      req.headers["x-callback-signature"];
    const isValid = verifyTelebirrWebhookSignature(req.rawBody || "", signature);
    if (!isValid) {
      return res.status(401).json({ message: "Invalid Telebirr signature." });
    }

    const body = req.body || {};
    const status = String(body.status || body.paymentStatus || "").toLowerCase();
    const metadata = body.metadata || {};
    const reservationId = String(body.reservationId || metadata.reservationId || "").trim();
    const paymentReference = String(body.transactionId || body.reference || body.orderId || "").trim();
    const paymentSessionId = String(body.paymentSessionId || body.sessionId || "").trim();

    if (!isObjectId(reservationId)) {
      return res.status(400).json({ message: "Invalid reservationId in webhook." });
    }

    const ticket = await QueueTicket.findOne({ _id: reservationId });
    if (!ticket) return res.status(404).json({ message: "Reservation not found." });

    if (ticket.status !== "pending_payment") {
      return res.json({ ok: true, message: "Reservation already processed." });
    }

    if (status === "success" || status === "paid" || status === "completed") {
      await activatePaidTicket(ticket, paymentReference, paymentSessionId);
      return res.json({ ok: true, message: "Payment confirmed." });
    }

    if (status === "failed" || status === "cancelled" || status === "canceled") {
      ticket.depositStatus = "pending";
      if (ticket.paymentExpiresAt && ticket.paymentExpiresAt <= new Date()) {
        ticket.status = "expired";
      }
      await ticket.save();
      return res.json({ ok: true, message: "Payment not completed." });
    }

    return res.json({ ok: true, message: "Webhook received." });
  } catch (error) {
    console.error("[Telebirr:webhook]", {
      message: error?.message,
      stack: error?.stack
    });
    return res.status(500).json({ message: "Failed to process Telebirr webhook." });
  }
};

exports.getMyReservationStatus = async (req, res) => {
  try {
    const userId = req.user.id;
    const { reservationId } = req.params;

    if (!isObjectId(userId) || !isObjectId(reservationId)) {
      return res.status(400).json({ message: "Invalid userId or reservationId." });
    }

    const ticket = await QueueTicket.findOne({
      _id: reservationId,
      userId
    });
    if (!ticket) {
      return res.status(404).json({ message: "Reservation not found." });
    }

    await expireStaleTickets(ticket.stationId);
    const freshTicket = await QueueTicket.findById(ticket._id);
    if (!freshTicket) {
      return res.status(404).json({ message: "Reservation not found." });
    }

    return res.json({
      reservationId: freshTicket._id,
      stationId: freshTicket.stationId,
      status: freshTicket.status,
      position: freshTicket.position,
      requestedBand: freshTicket.requestedBand,
      fuelType: freshTicket.fuelType,
      paymentProvider: freshTicket.paymentProvider,
      paymentSessionId: freshTicket.paymentSessionId,
      paymentReference: freshTicket.paymentReference,
      requestedLiters: freshTicket.requestedLiters,
      unitPrice: freshTicket.unitPrice,
      estimatedAmount: freshTicket.estimatedAmount,
      depositStatus: freshTicket.depositStatus,
      paymentExpiresAt: freshTicket.paymentExpiresAt,
      depositPaidAt: freshTicket.depositPaidAt
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to load reservation status." });
  }
};

exports.getMyTicket = async (req, res) => {
  try {
    const userId = req.user.id;
    const { stationId } = req.params;

    if (!isObjectId(userId) || !isObjectId(stationId)) {
      return res.status(400).json({ message: "Invalid userId or stationId." });
    }

    await expireStaleTickets(stationId);

    const ticket = await QueueTicket.findOne({
      userId,
      stationId,
      status: { $in: ACTIVE_STATUSES }
    }).sort({ joinedAt: -1 });

    if (!ticket) return res.status(404).json({ message: "No active ticket." });

    const etaMinutes = Math.max(0, ticket.position * AVERAGE_MINUTES_PER_CAR);
    return res.json({
      ticketId: ticket._id,
      reservationId: ticket._id,
      stationId: ticket.stationId,
      status: ticket.status,
      position: ticket.position,
      etaMinutes,
      requestedBand: ticket.requestedBand,
      fuelType: ticket.fuelType,
      requestedLiters: ticket.requestedLiters,
      unitPrice: ticket.unitPrice,
      estimatedAmount: ticket.estimatedAmount,
      depositAmount: ticket.depositAmount,
      depositCurrency: ticket.depositCurrency,
      depositStatus: ticket.depositStatus,
      paymentExpiresAt: ticket.paymentExpiresAt
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to load ticket." });
  }
};

exports.leaveQueue = async (req, res) => {
  try {
    const userId = req.user.id;
    const { ticketId } = req.body;

    if (!isObjectId(userId) || !isObjectId(ticketId)) {
      return res.status(400).json({ message: "Invalid userId or ticketId." });
    }

    const ticket = await QueueTicket.findOne({
      _id: ticketId,
      userId,
      status: { $in: ACTIVE_STATUSES }
    });
    if (!ticket) return res.status(404).json({ message: "Active ticket not found." });

    ticket.status = "cancelled";
    if (ticket.depositStatus === "authorized") {
      ticket.depositStatus = "refunded";
    }
    await ticket.save();

    if (ticket.position > 0) {
      await recalculatePositions(ticket.stationId);
    }
    emitQueueUpdated(ticket.stationId);

    return res.json({ message: "Left queue successfully." });
  } catch (error) {
    return res.status(500).json({ message: "Failed to leave queue." });
  }
};

exports.nextInQueue = async (req, res) => {
  try {
    const actor = req.user || null;
    const { stationId } = req.body;
    if (!isObjectId(stationId)) {
      return res.status(400).json({ message: "Invalid stationId." });
    }
    if (!(await canOperateStation(actor, stationId))) {
      return res.status(403).json({ message: "Forbidden: station scope denied for queue control." });
    }

    await expireStaleTickets(stationId);

    const currentCalled = await QueueTicket.findOne({
      stationId,
      status: "called"
    }).sort({ calledAt: 1 });

    if (currentCalled) {
      currentCalled.status = "served";
      currentCalled.servedAt = new Date();
      await currentCalled.save();
    }

    const next = await QueueTicket.findOne({
      stationId,
      status: "waiting"
    }).sort({ joinedAt: 1, _id: 1 });

    if (!next) {
      emitQueueUpdated(stationId);
      return res.json({ message: "Queue is empty.", nextTicket: null });
    }

    next.status = "called";
    next.calledAt = new Date();
    next.expiresAt = new Date(Date.now() + CALL_WINDOW_MINUTES * 60 * 1000);
    await next.save();

    await recalculatePositions(stationId);
    emitQueueUpdated(stationId);

    const io = getIO();
    if (io) {
      io.to(stationRoom(stationId)).emit("ticket_called", {
        stationId: String(stationId),
        ticketId: String(next._id),
        userId: String(next.userId)
      });
    }

    return res.json({
      message: "Next ticket called.",
      nextTicket: {
        ticketId: next._id,
        reservationId: next._id,
        userId: next.userId,
        status: next.status
      }
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to call next ticket." });
  }
};

exports.getStationQueue = async (req, res) => {
  try {
    const { stationId } = req.params;
    if (!isObjectId(stationId)) {
      return res.status(400).json({ message: "Invalid stationId." });
    }

    await expireStaleTickets(stationId);

    const waiting = await QueueTicket.find({
      stationId,
      status: "waiting"
    })
      .sort({ position: 1 })
      .select("userId position joinedAt")
      .lean();

    const called = await QueueTicket.findOne({
      stationId,
      status: "called"
    })
      .sort({ calledAt: -1 })
      .select("userId calledAt expiresAt")
      .lean();

    const waitingWithIds = waiting.map((item) => ({
      ...item,
      reservationId: item._id,
      ticketId: item._id
    }));

    const calledWithIds = called
      ? {
          ...called,
          reservationId: called._id,
          ticketId: called._id
        }
      : null;

    return res.json({
      stationId,
      waitingCount: waitingWithIds.length,
      called: calledWithIds,
      waiting: waitingWithIds
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to load station queue." });
  }
};

exports.startCheckIn = async (req, res) => {
  try {
    const userId = req.user.id;
    const { ticketId, lat, lon, accuracy } = req.body;
    if (!isObjectId(userId) || !isObjectId(ticketId)) {
      return res.status(400).json({ message: "Invalid userId or ticketId." });
    }

    const ticket = await QueueTicket.findOne({
      _id: ticketId,
      userId,
      status: { $in: ["waiting", "called"] }
    });
    if (!ticket) {
      return res.status(404).json({ message: "Eligible ticket not found for check-in." });
    }
    if (ticket.checkInStatus === "verified") {
      return res.status(409).json({ message: "Ticket already verified for station check-in." });
    }

    const station = await Station.findById(ticket.stationId).lean();
    if (!station?.location?.coordinates || station.location.coordinates.length < 2) {
      return res.status(400).json({ message: "Station location not configured." });
    }

    const userLat = Number(lat);
    const userLon = Number(lon);
    const userAccuracy = Number(accuracy || 0);
    if (!Number.isFinite(userLat) || !Number.isFinite(userLon)) {
      return res.status(400).json({ message: "lat and lon are required numeric values." });
    }
    if (Number.isFinite(userAccuracy) && userAccuracy > CHECKIN_MAX_ACCURACY_METERS) {
      return res.status(400).json({ message: "Location accuracy is too low for check-in. Move to open sky and retry." });
    }

    const [stationLon, stationLat] = station.location.coordinates;
    const distanceMeters = haversineDistanceMeters(userLat, userLon, Number(stationLat), Number(stationLon));
    if (distanceMeters > CHECKIN_RADIUS_METERS) {
      ticket.checkInStatus = "rejected";
      await ticket.save();
      return res.status(403).json({
        message: "You are outside station check-in radius.",
        distanceMeters: Math.round(distanceMeters),
        allowedRadiusMeters: CHECKIN_RADIUS_METERS
      });
    }

    const otpCode = generateOtpCode();
    const otpHash = hashOtpCode(otpCode);
    const otpExpiresAt = new Date(Date.now() + CHECKIN_OTP_TTL_SECONDS * 1000);
    const qrNonce = crypto.randomBytes(12).toString("hex");
    const qrToken = buildCheckInQrToken({
      ticketId: String(ticket._id),
      stationId: String(ticket.stationId),
      nonce: qrNonce,
      exp: Math.floor(otpExpiresAt.getTime() / 1000)
    });

    ticket.checkInStatus = "arrived";
    ticket.checkInStartedAt = new Date();
    ticket.checkInOtpHash = otpHash;
    ticket.checkInOtpExpiresAt = otpExpiresAt;
    ticket.checkInOtpAttempts = 0;
    ticket.checkInQrNonce = qrNonce;
    ticket.checkInLocation = {
      lat: userLat,
      lon: userLon,
      accuracy: Number.isFinite(userAccuracy) ? userAccuracy : undefined
    };
    await ticket.save();

    return res.json({
      ticketId: ticket._id,
      checkInStatus: ticket.checkInStatus,
      expiresAt: otpExpiresAt,
      otpCode,
      qrToken
    });
  } catch (_error) {
    return res.status(500).json({ message: "Failed to start station check-in." });
  }
};

exports.verifyCheckIn = async (req, res) => {
  try {
    const actor = req.user || null;
    const verifierUserId = req.user.id;
    const ticketOrReservationId = String(req.body.ticketId || req.body.reservationId || "").trim();
    const { otpCode, qrToken } = req.body;
    if (!isObjectId(verifierUserId) || !isObjectId(ticketOrReservationId)) {
      return res.status(400).json({ message: "Invalid verifier userId or ticketId/reservationId." });
    }

    const ticket = await QueueTicket.findOne({
      _id: ticketOrReservationId,
      status: { $in: ["waiting", "called"] }
    });
    if (!ticket) {
      return res.status(404).json({ message: "Ticket not found for check-in verification." });
    }
    if (!(await canOperateStation(actor, ticket.stationId))) {
      return res.status(403).json({ message: "Forbidden: station scope denied for check-in verification." });
    }
    if (ticket.checkInStatus === "verified") {
      return res.status(409).json({ message: "Ticket check-in already verified." });
    }
    if (ticket.checkInStatus !== "arrived") {
      return res.status(400).json({ message: "Check-in session not started. Start check-in first." });
    }
    if (!ticket.checkInOtpExpiresAt || ticket.checkInOtpExpiresAt <= new Date()) {
      return res.status(410).json({ message: "Check-in session expired. Restart check-in." });
    }
    if (ticket.checkInOtpAttempts >= CHECKIN_MAX_OTP_ATTEMPTS) {
      return res.status(429).json({ message: "Maximum OTP attempts reached. Restart check-in." });
    }

    let verified = false;
    if (qrToken) {
      const payload = verifyCheckInQrToken(qrToken);
      if (
        payload &&
        String(payload.ticketId) === String(ticket._id) &&
        String(payload.stationId) === String(ticket.stationId) &&
        String(payload.nonce) === String(ticket.checkInQrNonce || "")
      ) {
        verified = true;
      }
    }

    if (!verified && otpCode) {
      const incomingHash = hashOtpCode(otpCode);
      const savedHash = String(ticket.checkInOtpHash || "");
      if (
        savedHash &&
        savedHash.length === incomingHash.length &&
        crypto.timingSafeEqual(Buffer.from(savedHash), Buffer.from(incomingHash))
      ) {
        verified = true;
      } else {
        ticket.checkInOtpAttempts = Number(ticket.checkInOtpAttempts || 0) + 1;
        await ticket.save();
      }
    }

    if (!verified) {
      return res.status(401).json({ message: "Invalid OTP/QR check-in proof." });
    }

    ticket.checkInStatus = "verified";
    ticket.checkInVerifiedAt = new Date();
    ticket.verifiedByUserId = verifierUserId;
    ticket.checkInOtpHash = "";
    ticket.checkInOtpExpiresAt = null;
    ticket.checkInOtpAttempts = 0;
    ticket.checkInQrNonce = "";
    await ticket.save();

    return res.json({
      ok: true,
      ticketId: ticket._id,
      reservationId: ticket._id,
      checkInStatus: ticket.checkInStatus,
      verifiedAt: ticket.checkInVerifiedAt
    });
  } catch (_error) {
    return res.status(500).json({ message: "Failed to verify station check-in." });
  }
};

exports.validateReservationIdForStaff = async (req, res) => {
  try {
    const actor = req.user || null;
    const rawId = String(req.body.ticketId || req.body.reservationId || "").trim();
    if (!isObjectId(rawId)) {
      return res.status(400).json({ message: "Invalid ticketId/reservationId format." });
    }

    const ticket = await QueueTicket.findById(rawId).lean();
    if (!ticket) {
      return res.status(404).json({ message: "Reservation not found." });
    }
    if (!(await canOperateStation(actor, ticket.stationId))) {
      return res.status(403).json({ message: "Forbidden: station scope denied for this reservation." });
    }

    const eligibleStatuses = new Set(["waiting", "called"]);
    const status = String(ticket.status || "");
    const checkInStatus = String(ticket.checkInStatus || "pending");
    const canVerifyCheckIn =
      eligibleStatuses.has(status) &&
      checkInStatus === "arrived" &&
      (!ticket.checkInOtpExpiresAt || new Date(ticket.checkInOtpExpiresAt) > new Date());

    return res.json({
      ok: true,
      reservation: {
        reservationId: String(ticket._id),
        ticketId: String(ticket._id),
        stationId: String(ticket.stationId),
        userId: String(ticket.userId),
        status,
        position: Number(ticket.position || 0),
        checkInStatus,
        checkInOtpExpiresAt: ticket.checkInOtpExpiresAt || null,
        canVerifyCheckIn
      }
    });
  } catch (_error) {
    return res.status(500).json({ message: "Failed to validate reservation id." });
  }
};
