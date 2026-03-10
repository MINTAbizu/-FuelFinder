const mongoose = require("mongoose");
const chapaService = require("../services/chapa.service");
const QueueTicket = require("../models/QueueTicket");
const Station = require("../models/Station");
const { getIO } = require("../socket");

function isObjectId(value) {
  return mongoose.Types.ObjectId.isValid(value);
}

function requireEnv(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) {
    const error = new Error(`${name} is not configured.`);
    error.status = 500;
    throw error;
  }
  return value;
}

function buildCallbackUrl() {
  const baseUrl = String(process.env.BASE_URL || "").trim().replace(/\/+$/, "");
  if (!baseUrl) return "";
  return `${baseUrl}/api/payments/callback`;
}

function emitQueueUpdated(stationId) {
  const io = getIO();
  if (!io) return;
  io.to(`station:${stationId}`).emit("queue_updated", { stationId: String(stationId) });
}

function emitStationFuelUpdated(stationId, fuelInventory, fuelStatus) {
  const io = getIO();
  if (!io) return;
  io.to(`station:${stationId}`).emit("station_fuel_updated", {
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

function deriveFuelStatusFromInventory(inventory) {
  const gasoline = Number(inventory?.gasolineLiters || 0);
  const diesel = Number(inventory?.dieselLiters || 0);
  const other = Number(inventory?.otherLiters || 0);
  const total = gasoline + diesel + other;
  if (total <= 0) return "empty";
  if (total <= 300) return "partial";
  return "full";
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

exports.initialize = async (req, res) => {

  try {

    requireEnv("CHAPA_SECRET_KEY");

    const amount = Number(req.body.amount);
    const email = String(req.body.email || "").trim();
    const firstName = String(req.body.first_name || "").trim();
    const lastName = String(req.body.last_name || "").trim();
    const currency = String(req.body.currency || "ETB").trim().toUpperCase();
    const returnUrl = String(req.body.return_url || process.env.CHAPA_RETURN_URL || "").trim();
    const callbackUrl = buildCallbackUrl();

    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ message: "amount must be a positive number." });
    }
    if (!email) {
      return res.status(400).json({ message: "email is required." });
    }
    if (!firstName || !lastName) {
      return res.status(400).json({ message: "first_name and last_name are required." });
    }
    if (!callbackUrl) {
      return res.status(500).json({ message: "BASE_URL is not configured." });
    }

    const tx_ref = String(req.body.tx_ref || "").trim() || `tx-${Date.now()}`;
    const metadata = req.body.metadata || req.body.meta || {};

    const paymentData = {
      amount,
      currency,
      email,
      first_name: firstName,
      last_name: lastName,
      tx_ref,
      callback_url: callbackUrl,
      return_url: returnUrl || undefined,
      meta: metadata && typeof metadata === "object" ? metadata : undefined
    };

    const response = await chapaService.initializePayment(paymentData);

    res.json(response);

  } catch (error) {

    res.status(500).json({
      message: "Payment initialization failed",
      error: error.response?.data || error.message
    });

  }

};


exports.verify = async (req, res) => {

  try {

    const tx_ref = req.params.tx_ref;

    const response = await chapaService.verifyPayment(tx_ref);

    res.json(response);

  } catch (error) {

    res.status(500).json({
      message: "Payment verification failed"
    });

  }

};

exports.callback = async (req, res) => {
  try {
    const tx_ref =
      String(req.body?.tx_ref || req.query?.tx_ref || req.body?.reference || req.query?.reference || "").trim();

    if (!tx_ref) {
      return res.status(400).json({ message: "tx_ref is required." });
    }

    const response = await chapaService.verifyPayment(tx_ref);

    const status = String(response?.status || response?.data?.status || "").toLowerCase();
    if (status !== "success") {
      return res.json({ ok: true, status, message: "Payment not completed." });
    }

    const data = response?.data || {};
    const meta = data.meta || data.metadata || {};
    const reservationId = String(
      meta.reservationId || meta.ticketId || meta.reservation_id || req.body?.reservationId || ""
    ).trim();

    if (!isObjectId(reservationId)) {
      return res.status(400).json({ message: "reservationId is missing from payment metadata." });
    }

    const ticket = await QueueTicket.findById(reservationId);
    if (!ticket) {
      return res.status(404).json({ message: "Reservation not found." });
    }

    if (["waiting", "called", "served"].includes(String(ticket.status || ""))) {
      return res.json({
        ok: true,
        message: "Reservation already activated.",
        reservationId: ticket._id,
        status: ticket.status
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

    const consume = await consumeStationFuel(ticket.stationId, ticket.fuelType, ticket.requestedLiters);
    if (!consume.ok) {
      return res.status(409).json({ message: "Not enough fuel left at this station for requested liters." });
    }

    const queueCount = await QueueTicket.countDocuments({
      stationId: ticket.stationId,
      status: "waiting"
    });

    ticket.status = "waiting";
    ticket.position = queueCount + 1;
    ticket.paymentProvider = "chapa";
    ticket.paymentReference = String(data.reference || data.tx_ref || tx_ref || "").trim();
    ticket.depositStatus = ticket.depositAmount > 0 ? "authorized" : "not_required";
    ticket.depositPaidAt = new Date();
    ticket.joinedAt = new Date();
    await ticket.save();

    emitQueueUpdated(ticket.stationId);

    return res.json({
      ok: true,
      message: "Payment confirmed.",
      reservationId: ticket._id,
      status: ticket.status,
      position: ticket.position
    });
  } catch (error) {
    return res.status(500).json({
      message: "Payment callback verification failed",
      error: error.response?.data || error.message
    });
  }
};
