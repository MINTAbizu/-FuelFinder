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
const STATUS_TRANSITIONS = {
  pending_payment: new Set(["waiting", "expired", "cancelled"]),
  waiting: new Set(["called", "served", "cancelled", "expired"]),
  called: new Set(["served", "cancelled", "expired"]),
  served: new Set([]),
  cancelled: new Set([]),
  expired: new Set([])
};

function canTransitionStatus(fromStatus, toStatus) {
  const from = String(fromStatus || "");
  const to = String(toStatus || "");
  if (from === to) return true;
  const allowed = STATUS_TRANSITIONS[from];
  return Boolean(allowed && allowed.has(to));
}

function isDuplicateActiveTicketError(error) {
  if (!error) return false;
  const code = Number(error.code || 0);
  return code === 11000 && String(error?.message || "").includes("userId_1_stationId_1");
}

function stationRoom(stationId) {
  return `station:${stationId}`;
}

function emitQueueUpdated(stationId) {
  const io = getIO();
  if (!io) return;
  io.to(stationRoom(stationId)).emit("queue_updated", { stationId: String(stationId) });
}

function emitStationFuelUpdated(stationId, fuelInventory, fuelStatus) {
  const io = getIO();
  if (!io) return;
  io.to(stationRoom(stationId)).emit("station_fuel_updated", {
    stationId: String(stationId),
    fuelStatus: String(fuelStatus || ""),
    fuelInventory: {
      gasolineLiters: Number(fuelInventory?.gasolineLiters || 0),
      dieselLiters: Number(fuelInventory?.dieselLiters || 0),
      otherLiters: Number(fuelInventory?.otherLiters || 0),
      updatedAt: fuelInventory?.updatedAt || null
    }
  });
}

function isObjectId(value) {
  return mongoose.Types.ObjectId.isValid(value);
}

function normalizeReservationCode(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/[^A-Z0-9-]/g, "");
}

function buildReservationCodePrefix(stationId) {
  const text = String(stationId || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const suffix = text.slice(-3) || "GEN";
  return `R${suffix}`;
}

function generateRandomCodePart(length = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  const bytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i += 1) {
    out += chars[bytes[i] % chars.length];
  }
  return out;
}

async function generateUniquePublicTicketCode(stationId) {
  const prefix = buildReservationCodePrefix(stationId);
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const candidate = `${prefix}-${generateRandomCodePart(6)}`;
    // eslint-disable-next-line no-await-in-loop
    const exists = await QueueTicket.exists({ publicTicketCode: candidate });
    if (!exists) return candidate;
  }
  throw new Error("Unable to generate unique reservation code.");
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

function resolveLitersInput(value) {
  const liters = Number(value);
  if (!Number.isFinite(liters)) return null;
  if (liters < 0 || liters > 1000000) return null;
  return Number(liters.toFixed(2));
}

function deriveFuelStatusFromInventory(inventory) {
  const gasoline = Number(inventory?.gasolineLiters || 0);
  const diesel = Number(inventory?.dieselLiters || 0);
  const other = Number(inventory?.otherLiters || 0);
  const total = gasoline + diesel + other;
  if (total <= 0) return "empty";
  if (total <= 300) return "partial";
  return "full";
}

async function getStationFuelSnapshot(stationId) {
  const station = await Station.findById(stationId)
    .select("_id fuelStatus fuelInventory")
    .lean();
  if (!station) return null;
  const inventory = station.fuelInventory || {};
  return {
    stationId: String(station._id),
    fuelStatus: station.fuelStatus || deriveFuelStatusFromInventory(inventory),
    fuelInventory: {
      gasolineLiters: Number(inventory.gasolineLiters || 0),
      dieselLiters: Number(inventory.dieselLiters || 0),
      otherLiters: Number(inventory.otherLiters || 0),
      updatedAt: inventory.updatedAt || null,
      updatedByUserId: inventory.updatedByUserId ? String(inventory.updatedByUserId) : null
    }
  };
}

async function setStationFuelInventory(stationId, payload, actorUserId) {
  const station = await Station.findById(stationId);
  if (!station) return null;

  const current = station.fuelInventory || {};
  const nextGasoline = payload.gasolineLiters !== undefined
    ? resolveLitersInput(payload.gasolineLiters)
    : Number(current.gasolineLiters || 0);
  const nextDiesel = payload.dieselLiters !== undefined
    ? resolveLitersInput(payload.dieselLiters)
    : Number(current.dieselLiters || 0);
  const nextOther = payload.otherLiters !== undefined
    ? resolveLitersInput(payload.otherLiters)
    : Number(current.otherLiters || 0);

  if (nextGasoline === null || nextDiesel === null || nextOther === null) {
    throw new Error("Fuel liters must be non-negative numbers.");
  }

  station.fuelInventory = {
    gasolineLiters: nextGasoline,
    dieselLiters: nextDiesel,
    otherLiters: nextOther,
    updatedAt: new Date(),
    updatedByUserId: actorUserId || null
  };
  station.fuelStatus = deriveFuelStatusFromInventory(station.fuelInventory);
  await station.save();

  return {
    fuelStatus: station.fuelStatus,
    fuelInventory: {
      gasolineLiters: Number(station.fuelInventory.gasolineLiters || 0),
      dieselLiters: Number(station.fuelInventory.dieselLiters || 0),
      otherLiters: Number(station.fuelInventory.otherLiters || 0),
      updatedAt: station.fuelInventory.updatedAt || null,
      updatedByUserId: station.fuelInventory.updatedByUserId
        ? String(station.fuelInventory.updatedByUserId)
        : null
    }
  };
}

async function consumeStationFuel(stationId, fuelType, requestedLiters) {
  const liters = Number(requestedLiters || 0);
  if (!Number.isFinite(liters) || liters <= 0) {
    return { ok: true, changed: false };
  }
  const keyByType = {
    gasoline: "fuelInventory.gasolineLiters",
    diesel: "fuelInventory.dieselLiters",
    other: "fuelInventory.otherLiters"
  };
  const field = keyByType[String(fuelType || "").toLowerCase()];
  if (!field) return { ok: true, changed: false };

  const station = await Station.findOne({
    _id: stationId,
    [field]: { $gte: liters }
  });
  if (!station) {
    return { ok: false, reason: "insufficient_fuel" };
  }

  const current = station.fuelInventory || {};
  const next = {
    gasolineLiters: Number(current.gasolineLiters || 0),
    dieselLiters: Number(current.dieselLiters || 0),
    otherLiters: Number(current.otherLiters || 0)
  };
  if (field === "fuelInventory.gasolineLiters") next.gasolineLiters -= liters;
  if (field === "fuelInventory.dieselLiters") next.dieselLiters -= liters;
  if (field === "fuelInventory.otherLiters") next.otherLiters -= liters;

  station.fuelInventory = {
    ...current,
    ...next,
    updatedAt: new Date(),
    updatedByUserId: null
  };
  station.fuelStatus = deriveFuelStatusFromInventory(station.fuelInventory);
  await station.save();
  emitStationFuelUpdated(stationId, station.fuelInventory, station.fuelStatus);
  return { ok: true, changed: true };
}

async function restoreStationFuel(stationId, fuelType, requestedLiters) {
  const liters = Number(requestedLiters || 0);
  if (!Number.isFinite(liters) || liters <= 0) return { ok: true, changed: false };
  const station = await Station.findById(stationId);
  if (!station) return { ok: false, changed: false };

  const current = station.fuelInventory || {};
  const next = {
    gasolineLiters: Number(current.gasolineLiters || 0),
    dieselLiters: Number(current.dieselLiters || 0),
    otherLiters: Number(current.otherLiters || 0)
  };
  const type = String(fuelType || "").toLowerCase();
  if (type === "gasoline") next.gasolineLiters += liters;
  if (type === "diesel") next.dieselLiters += liters;
  if (type === "other") next.otherLiters += liters;

  station.fuelInventory = {
    ...current,
    ...next,
    updatedAt: new Date(),
    updatedByUserId: null
  };
  station.fuelStatus = deriveFuelStatusFromInventory(station.fuelInventory);
  await station.save();
  emitStationFuelUpdated(stationId, station.fuelInventory, station.fuelStatus);
  return { ok: true, changed: true };
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
  if (!canTransitionStatus(ticket.status, "waiting")) {
    return ticket;
  }

  const consume = await consumeStationFuel(ticket.stationId, ticket.fuelType, ticket.requestedLiters);
  if (!consume.ok) {
    throw new Error("insufficient_fuel_stock");
  }

  const queueCount = await QueueTicket.countDocuments({
    stationId: ticket.stationId,
    status: "waiting"
  });

  ticket.status = "waiting";
  ticket.position = queueCount + 1;
  ticket.paymentReference = String(paymentReference || ticket.paymentReference || "").trim();
  ticket.paymentSessionId = String(paymentSessionId || ticket.paymentSessionId || "").trim();
  ticket.paymentProvider = "telebirr";
  if (!String(ticket.publicTicketCode || "").trim()) {
    ticket.publicTicketCode = await generateUniquePublicTicketCode(ticket.stationId);
  }
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
        reservationCode: existing.publicTicketCode || "",
        status: existing.status,
        position: existing.position
      });
    }

    const depositAmount = RESERVATION_BAND_DEPOSITS[requestedBand];
    const estimatedAmount = Number((requestedLiters * unitPrice).toFixed(2));
    const paymentExpiresAt = new Date(Date.now() + PAYMENT_WINDOW_MINUTES * 60 * 1000);
    const publicTicketCode = await generateUniquePublicTicketCode(stationId);

    const ticket = await QueueTicket.create({
      userId,
      stationId,
      publicTicketCode,
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
    emitQueueUpdated(stationId);

    return res.status(201).json({
      reservationId: ticket._id,
      reservationCode: ticket.publicTicketCode || "",
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
    if (isDuplicateActiveTicketError(error)) {
      const userId = req.user?.id;
      const stationId = req.body?.stationId;
      const existing = await QueueTicket.findOne({
        userId,
        stationId,
        status: { $in: ACTIVE_STATUSES }
      }).lean();
      if (existing) {
        return res.status(409).json({
          message: "You already have an active reservation/ticket for this station.",
          ticketId: existing._id,
          reservationCode: existing.publicTicketCode || "",
          status: existing.status,
          position: existing.position
        });
      }
    }
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
        reservationCode: existing.publicTicketCode || "",
        position: existing.position
      });
    }

    const queueCount = await QueueTicket.countDocuments({
      stationId,
      status: "waiting"
    });
    const position = queueCount + 1;
    const publicTicketCode = await generateUniquePublicTicketCode(stationId);

    const ticket = await QueueTicket.create({
      userId,
      stationId,
      publicTicketCode,
      status: "waiting",
      position,
      depositStatus: "not_required"
    });

    const etaMinutes = position * AVERAGE_MINUTES_PER_CAR;
    emitQueueUpdated(stationId);

    return res.status(201).json({
      ticketId: ticket._id,
      reservationCode: ticket.publicTicketCode || "",
      stationId,
      position,
      status: ticket.status,
      etaMinutes
    });
  } catch (error) {
    if (isDuplicateActiveTicketError(error)) {
      const userId = req.user?.id;
      const stationId = req.body?.stationId;
      const existing = await QueueTicket.findOne({
        userId,
        stationId,
        status: { $in: ACTIVE_STATUSES }
      }).lean();
      if (existing) {
        return res.status(409).json({
          message: "You already have an active ticket for this station.",
          ticketId: existing._id,
          reservationCode: existing.publicTicketCode || "",
          status: existing.status,
          position: existing.position
        });
      }
    }
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
      userId
    });
    if (!ticket) {
      return res.status(404).json({ message: "Reservation not found." });
    }

    if (["waiting", "called", "served"].includes(String(ticket.status || ""))) {
      const etaMinutes = Math.max(0, Number(ticket.position || 0) * AVERAGE_MINUTES_PER_CAR);
      return res.json({
        ticketId: ticket._id,
        reservationId: ticket._id,
        reservationCode: ticket.publicTicketCode || "",
        stationId: ticket.stationId,
        status: ticket.status,
        position: ticket.position,
        etaMinutes,
        depositStatus: ticket.depositStatus,
        message: "Reservation already paid."
      });
    }
    if (ticket.status !== "pending_payment") {
      return res.status(409).json({
        message: `Reservation is already ${ticket.status}.`,
        status: ticket.status
      });
    }

    if (ticket.paymentExpiresAt && ticket.paymentExpiresAt <= new Date()) {
      ticket.status = "expired";
      await ticket.save();
      return res.status(410).json({ message: "Reservation payment window expired." });
    }

    try {
      await activatePaidTicket(ticket, paymentRef, ticket.paymentSessionId);
    } catch (err) {
      if (String(err?.message || "") === "insufficient_fuel_stock") {
        return res.status(409).json({ message: "Not enough fuel left at this station for requested liters." });
      }
      throw err;
    }

    const etaMinutes = Math.max(0, Number(ticket.position || 0) * AVERAGE_MINUTES_PER_CAR);
    return res.json({
      ticketId: ticket._id,
      reservationId: ticket._id,
      reservationCode: ticket.publicTicketCode || "",
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
      reservationCode: ticket.publicTicketCode || "",
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
      try {
        await activatePaidTicket(ticket, paymentReference, paymentSessionId);
      } catch (err) {
        if (String(err?.message || "") === "insufficient_fuel_stock") {
          return res.status(409).json({ ok: false, message: "Insufficient station fuel stock." });
        }
        throw err;
      }
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
      reservationCode: freshTicket.publicTicketCode || "",
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
      reservationCode: ticket.publicTicketCode || "",
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
    const previousStatus = String(ticket.status || "");

    ticket.status = "cancelled";
    if (ticket.depositStatus === "authorized") {
      ticket.depositStatus = "refunded";
    }
    await ticket.save();

    if (["waiting", "called"].includes(previousStatus)) {
      await restoreStationFuel(ticket.stationId, ticket.fuelType, ticket.requestedLiters);
    }

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
        reservationCode: String(next.publicTicketCode || ""),
        userId: String(next.userId)
      });
    }

    return res.json({
      message: "Next ticket called.",
      nextTicket: {
        ticketId: next._id,
        reservationId: next._id,
        reservationCode: next.publicTicketCode || "",
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
    const includePending = String(req.query.includePending || "").toLowerCase() === "true";
    if (!isObjectId(stationId)) {
      return res.status(400).json({ message: "Invalid stationId." });
    }

    await expireStaleTickets(stationId);

    const waiting = await QueueTicket.find({
      stationId,
      status: "waiting"
    })
      .sort({ position: 1 })
      .select("userId position joinedAt publicTicketCode")
      .lean();

    const called = await QueueTicket.findOne({
      stationId,
      status: "called"
    })
      .sort({ calledAt: -1 })
      .select("userId calledAt expiresAt publicTicketCode")
      .lean();

    const waitingWithIds = waiting.map((item) => ({
      ...item,
      reservationId: item._id,
      ticketId: item._id,
      reservationCode: item.publicTicketCode || ""
    }));

    const calledWithIds = called
      ? {
          ...called,
          reservationId: called._id,
          ticketId: called._id,
          reservationCode: called.publicTicketCode || ""
        }
      : null;

    const pending = includePending
      ? await QueueTicket.find({
          stationId,
          $or: [
            { status: "pending_payment" },
            { status: "expired", depositStatus: "pending" }
          ]
        })
          .sort({ createdAt: -1 })
          .select("userId status paymentExpiresAt createdAt publicTicketCode requestedBand requestedLiters fuelType")
          .lean()
      : [];

    const pendingWithIds = includePending
      ? pending.map((item) => ({
          ...item,
          reservationId: item._id,
          ticketId: item._id,
          reservationCode: item.publicTicketCode || ""
        }))
      : [];
    const stationFuel = await getStationFuelSnapshot(stationId);

    return res.json({
      stationId,
      waitingCount: waitingWithIds.length,
      called: calledWithIds,
      waiting: waitingWithIds,
      pendingCount: pendingWithIds.length,
      pending: pendingWithIds,
      fuelStatus: stationFuel?.fuelStatus || "partial",
      fuelInventory: stationFuel?.fuelInventory || {
        gasolineLiters: 0,
        dieselLiters: 0,
        otherLiters: 0,
        updatedAt: null,
        updatedByUserId: null
      }
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
      reservationCode: String(ticket.publicTicketCode || ""),
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
      reservationCode: ticket.publicTicketCode || "",
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
    const reservationCode = normalizeReservationCode(req.body.reservationCode);
    const { otpCode, qrToken } = req.body;
    if (!isObjectId(verifierUserId)) {
      return res.status(400).json({ message: "Invalid verifier userId." });
    }
    if (!ticketOrReservationId && !reservationCode && !String(qrToken || "").trim()) {
      return res.status(400).json({
        message: "ticketId/reservationId, reservationCode, or qrToken is required."
      });
    }
    if (ticketOrReservationId && !isObjectId(ticketOrReservationId)) {
      return res.status(400).json({ message: "Invalid ticketId/reservationId." });
    }

    let qrPayload = null;
    let ticketFilter = null;
    if (ticketOrReservationId) {
      ticketFilter = {
        _id: ticketOrReservationId,
        status: { $in: ["waiting", "called"] }
      };
    } else if (reservationCode) {
      ticketFilter = {
        publicTicketCode: reservationCode,
        status: { $in: ["waiting", "called"] }
      };
    } else {
      qrPayload = verifyCheckInQrToken(qrToken);
      if (!qrPayload || !isObjectId(qrPayload.ticketId)) {
        return res.status(401).json({ message: "Invalid OTP/QR check-in proof." });
      }
      ticketFilter = {
        _id: qrPayload.ticketId,
        status: { $in: ["waiting", "called"] }
      };
    }

    const ticket = await QueueTicket.findOne(ticketFilter);
    if (!ticket) {
      return res.status(404).json({ message: "Ticket not found for check-in verification." });
    }
    if (!(await canOperateStation(actor, ticket.stationId))) {
      const station = await Station.findById(ticket.stationId).select("_id name organizationId").lean();
      return res.status(403).json({
        message: "Forbidden: this reservation belongs to another station/company.",
        reason: "station_scope_mismatch",
        reservation: {
          reservationId: String(ticket._id),
          reservationCode: String(ticket.publicTicketCode || ""),
          stationId: String(ticket.stationId),
          stationName: String(station?.name || "Unknown station"),
          organizationId: station?.organizationId ? String(station.organizationId) : null
        }
      });
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
      const payload = qrPayload || verifyCheckInQrToken(qrToken);
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
      reservationCode: ticket.publicTicketCode || "",
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
    const reservationCode = normalizeReservationCode(req.body.reservationCode);
    if (!rawId && !reservationCode) {
      return res.status(400).json({ message: "ticketId/reservationId or reservationCode is required." });
    }

    let ticket = null;
    if (rawId) {
      if (!isObjectId(rawId)) {
        return res.status(400).json({ message: "Invalid ticketId/reservationId format." });
      }
      ticket = await QueueTicket.findById(rawId).lean();
    } else if (reservationCode) {
      ticket = await QueueTicket.findOne({ publicTicketCode: reservationCode }).lean();
    }

    if (!ticket) {
      return res.status(404).json({ message: "Reservation not found." });
    }
    const station = await Station.findById(ticket.stationId).select("_id name organizationId").lean();

    if (!(await canOperateStation(actor, ticket.stationId))) {
      return res.status(403).json({
        message: "Forbidden: this reservation belongs to another station/company.",
        reason: "station_scope_mismatch",
        reservation: {
          reservationId: String(ticket._id),
          ticketId: String(ticket._id),
          reservationCode: String(ticket.publicTicketCode || ""),
          stationId: String(ticket.stationId),
          stationName: String(station?.name || "Unknown station"),
          organizationId: station?.organizationId ? String(station.organizationId) : null
        }
      });
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
        reservationCode: String(ticket.publicTicketCode || ""),
        stationId: String(ticket.stationId),
        stationName: String(station?.name || "Unknown station"),
        organizationId: station?.organizationId ? String(station.organizationId) : null,
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

exports.getStationFuelStatus = async (req, res) => {
  try {
    const { stationId } = req.params;
    if (!isObjectId(stationId)) {
      return res.status(400).json({ message: "Invalid stationId." });
    }
    const snapshot = await getStationFuelSnapshot(stationId);
    if (!snapshot) {
      return res.status(404).json({ message: "Station not found." });
    }
    return res.json(snapshot);
  } catch (_error) {
    return res.status(500).json({ message: "Failed to load station fuel status." });
  }
};

exports.updateStationFuelStock = async (req, res) => {
  try {
    const actor = req.user || null;
    const actorUserId = String(req.user?.id || "").trim();
    const stationId = String(req.body.stationId || req.params.stationId || "").trim();
    if (!isObjectId(stationId)) {
      return res.status(400).json({ message: "Invalid stationId." });
    }
    if (!(await canOperateStation(actor, stationId))) {
      return res.status(403).json({ message: "Forbidden: station scope denied for fuel update." });
    }

    const payload = {
      gasolineLiters: req.body.gasolineLiters,
      dieselLiters: req.body.dieselLiters,
      otherLiters: req.body.otherLiters
    };
    const updated = await setStationFuelInventory(stationId, payload, actorUserId || null);
    if (!updated) {
      return res.status(404).json({ message: "Station not found." });
    }

    emitStationFuelUpdated(stationId, updated.fuelInventory, updated.fuelStatus);
    return res.json({
      message: "Station fuel stock updated.",
      stationId: String(stationId),
      fuelStatus: updated.fuelStatus,
      fuelInventory: updated.fuelInventory
    });
  } catch (error) {
    if (String(error?.message || "").includes("Fuel liters")) {
      return res.status(400).json({ message: error.message });
    }
    return res.status(500).json({ message: "Failed to update station fuel stock." });
  }
};
