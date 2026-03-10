const mongoose = require("mongoose");
const crypto = require("crypto");
const chapaService = require("../services/chapa.service");
const QueueTicket = require("../models/QueueTicket");
const PaymentTransaction = require("../models/PaymentTransaction");
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

function buildTxRef(reservationId) {
  const suffix = String(reservationId || "").slice(-6).toUpperCase();
  return `FF-${suffix}-${Date.now()}`;
}

function getPlatformFeeBirr() {
  const raw = String(process.env.CHAPA_PLATFORM_FEE_BIRR || "2").trim();
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return 2;
  return Number(value.toFixed(2));
}

function getSplitMode() {
  const mode = String(process.env.CHAPA_SPLIT_MODE || "platform_fee").trim().toLowerCase();
  return mode === "subaccount_share" ? "subaccount_share" : "platform_fee";
}

function verifyChapaWebhookSignature(req) {
  const secret = String(process.env.CHAPA_WEBHOOK_SECRET || "").trim();
  if (!secret) {
    const error = new Error("CHAPA_WEBHOOK_SECRET is not configured.");
    error.status = 500;
    throw error;
  }

  const signatureHeader = String(req.headers["chapa-signature"] || req.headers["Chapa-Signature"] || "").trim();
  const payloadSignatureHeader = String(req.headers["x-chapa-signature"] || req.headers["X-Chapa-Signature"] || "").trim();
  const rawBody = String(req.rawBody || "");

  const signature = crypto.createHmac("sha256", secret).update(secret, "utf8").digest("hex");
  const payloadSignature = crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");

  if (
    signatureHeader &&
    signatureHeader.length === signature.length &&
    crypto.timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(signature))
  ) {
    return true;
  }
  if (
    payloadSignatureHeader &&
    payloadSignatureHeader.length === payloadSignature.length &&
    crypto.timingSafeEqual(Buffer.from(payloadSignatureHeader), Buffer.from(payloadSignature))
  ) {
    return true;
  }
  return false;
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

    const reservationId = String(req.body.reservationId || req.body.ticketId || "").trim();
    const email = String(req.body.email || "").trim();
    const firstName = String(req.body.first_name || "").trim();
    const lastName = String(req.body.last_name || "").trim();
    const currency = String(req.body.currency || "ETB").trim().toUpperCase();
    const returnUrl = String(req.body.return_url || process.env.CHAPA_RETURN_URL || "").trim();
    const callbackUrl = buildCallbackUrl();

    if (!isObjectId(reservationId)) {
      return res.status(400).json({ message: "reservationId is required." });
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

    const ticket = await QueueTicket.findById(reservationId);
    if (!ticket) {
      return res.status(404).json({ message: "Reservation not found." });
    }
    if (req.user && String(ticket.userId) !== String(req.user.id)) {
      return res.status(403).json({ message: "Forbidden: reservation does not belong to this user." });
    }
    const station = await Station.findById(ticket.stationId).select("_id chapaSubaccountId").lean();
    if (!station) {
      return res.status(404).json({ message: "Station not found for this reservation." });
    }
    const subaccountId = String(station.chapaSubaccountId || "").trim();
    if (!subaccountId) {
      return res.status(400).json({ message: "Station Chapa subaccount is not configured." });
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

    const baseAmount = Number(ticket.depositAmount > 0 ? ticket.depositAmount : ticket.estimatedAmount);
    if (!Number.isFinite(baseAmount) || baseAmount <= 0) {
      return res.status(400).json({ message: "Invalid amount for reservation." });
    }
    const platformFee = getPlatformFeeBirr();
    if (baseAmount <= 0 || baseAmount + platformFee <= 0) {
      return res.status(400).json({ message: "Amount is not enough to cover platform fee." });
    }
    const amount = Number((baseAmount + platformFee).toFixed(2));
    const stationPayout = Number((amount - platformFee).toFixed(2));
    const splitMode = getSplitMode();
    const splitValue = splitMode === "subaccount_share" ? stationPayout : platformFee;

    const existing = await PaymentTransaction.findOne({
      provider: "chapa",
      reservationId: ticket._id,
      status: { $in: ["initialized", "pending"] }
    }).sort({ createdAt: -1 });

    if (existing && existing.rawInitResponse) {
      return res.json(existing.rawInitResponse);
    }

    const tx_ref = String(req.body.tx_ref || "").trim() || buildTxRef(reservationId);
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
      subaccounts: [
        {
          id: subaccountId,
          split_type: "flat",
          split_value: splitValue
        }
      ],
      meta: {
        ...(metadata && typeof metadata === "object" ? metadata : {}),
        reservationId: String(ticket._id),
        userId: String(ticket.userId),
        stationId: String(ticket.stationId),
        platformFee,
        stationPayout
      }
    };

    let payment = await PaymentTransaction.findOne({ provider: "chapa", txRef: tx_ref });
    if (!payment) {
      payment = await PaymentTransaction.create({
        provider: "chapa",
        txRef: tx_ref,
        reservationId: ticket._id,
        userId: ticket.userId,
        stationId: ticket.stationId,
        amount,
        currency,
        platformFee,
        stationPayout,
        splitType: "flat",
        splitValue,
        subaccountId,
        status: "initialized",
        meta: paymentData.meta
      });
    }

    let response;
    try {
      response = await chapaService.initializePayment(paymentData);
    } catch (error) {
      payment.status = "failed";
      payment.rawInitResponse = error.response?.data || { message: error.message };
      await payment.save();
      throw error;
    }

    const responseStatus = String(response?.status || "").toLowerCase();
    const responseData = response?.data || {};
    payment.status = responseStatus || "initialized";
    payment.rawInitResponse = response;
    payment.checkoutUrl = String(responseData.checkout_url || responseData.checkoutUrl || "");
    payment.reference = String(responseData.reference || responseData.tx_ref || "");
    await payment.save();

    ticket.paymentProvider = "chapa";
    ticket.paymentReference = tx_ref;
    ticket.paymentSessionId = payment.reference || "";
    await ticket.save();

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

    requireEnv("CHAPA_SECRET_KEY");

    const tx_ref = req.params.tx_ref;

    const response = await chapaService.verifyPayment(tx_ref);

    const status = String(response?.status || response?.data?.status || "").toLowerCase();
    const normalizedStatus = ["success", "failed", "cancelled", "expired", "pending"]
      .includes(status)
      ? status
      : "pending";

    await PaymentTransaction.findOneAndUpdate(
      { provider: "chapa", txRef: tx_ref },
      {
        $set: {
          rawVerifyResponse: response,
          status: normalizedStatus,
          verifiedAt: new Date()
        }
      },
      { new: true }
    );

    res.json(response);

  } catch (error) {

    res.status(500).json({
      message: "Payment verification failed"
    });

  }

};

exports.callback = async (req, res) => {
  try {
    requireEnv("CHAPA_SECRET_KEY");
    if (!verifyChapaWebhookSignature(req)) {
      return res.status(401).json({ message: "Invalid Chapa webhook signature." });
    }

    const tx_ref =
      String(req.body?.tx_ref || req.query?.tx_ref || req.body?.reference || req.query?.reference || "").trim();

    if (!tx_ref) {
      return res.status(400).json({ message: "tx_ref is required." });
    }

    const response = await chapaService.verifyPayment(tx_ref);

    const status = String(response?.status || response?.data?.status || "").toLowerCase();
    const normalizedStatus = ["success", "failed", "cancelled", "expired", "pending"]
      .includes(status)
      ? status
      : "pending";
    if (normalizedStatus !== "success") {
      await PaymentTransaction.findOneAndUpdate(
        { provider: "chapa", txRef: tx_ref },
        {
          $set: {
            rawVerifyResponse: response,
            status: normalizedStatus,
            verifiedAt: new Date()
          }
        },
        { upsert: true }
      );
      return res.json({ ok: true, status: normalizedStatus, message: "Payment not completed." });
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

    const existingPayment = await PaymentTransaction.findOne({ provider: "chapa", txRef: tx_ref }).lean();
    const platformFee = Number(
      existingPayment?.platformFee ?? getPlatformFeeBirr()
    );
    const amountPaid = Number(
      data.amount || data.amount_payable || ticket.depositAmount || ticket.estimatedAmount || 0
    );
    const stationPayout = Number((Math.max(0, amountPaid - platformFee)).toFixed(2));
    const splitMode = getSplitMode();
    const splitValue = Number(
      existingPayment?.splitValue ?? (splitMode === "subaccount_share" ? stationPayout : platformFee)
    );

    await PaymentTransaction.findOneAndUpdate(
      { provider: "chapa", txRef: tx_ref },
      {
        $set: {
          reservationId: ticket._id,
          userId: ticket.userId,
          stationId: ticket.stationId,
          amount: amountPaid,
          currency: String(data.currency || "ETB").toUpperCase(),
          platformFee,
          stationPayout,
          splitType: existingPayment?.splitType || "flat",
          splitValue,
          subaccountId: existingPayment?.subaccountId || "",
          status: "success",
          reference: String(data.reference || data.tx_ref || tx_ref || ""),
          rawVerifyResponse: response,
          verifiedAt: new Date()
        }
      },
      { upsert: true }
    );

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
    ticket.paymentReference = String(data.tx_ref || tx_ref || "").trim();
    ticket.paymentSessionId = String(data.reference || data.reference_id || "").trim();
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
