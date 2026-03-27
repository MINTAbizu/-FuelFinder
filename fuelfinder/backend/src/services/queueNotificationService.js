const QueueTicket = require("../models/QueueTicket");
const Station = require("../models/Station");
const { getIO, userRoom } = require("../socket");

function trimText(value) {
  return String(value || "").trim();
}

function buildQueueTurnMessage({ stationName, reservationCode, callWindowMinutes }) {
  const safeStationName = trimText(stationName) || "your station";
  const safeReservationCode = trimText(reservationCode);
  const codeText = safeReservationCode ? ` Reservation ${safeReservationCode}.` : "";
  const windowText =
    Number.isFinite(Number(callWindowMinutes)) && Number(callWindowMinutes) > 0
      ? ` Please arrive within ${Number(callWindowMinutes)} minutes.`
      : " Please arrive as soon as possible.";

  return `FuelFinder: It's your turn at ${safeStationName}.${codeText}${windowText}`;
}

async function updateTicketNotification(ticketId, payload) {
  await QueueTicket.updateOne({ _id: ticketId }, { $set: payload });
}

async function notifyCustomerWhenTicketCalled(ticketId, options = {}) {
  const callWindowMinutes = Number(options.callWindowMinutes || 0);
  const ticket = await QueueTicket.findById(ticketId)
    .select(
      "_id userId stationId publicTicketCode status calledNotificationStatus calledNotificationSentAt expiresAt fuelType requestedLiters estimatedAmount"
    )
    .lean();

  if (!ticket) {
    return { ok: false, status: "missing", stateChanged: false };
  }

  if (String(ticket.status || "") !== "called") {
    return { ok: false, status: "skipped", stateChanged: false };
  }

  if (String(ticket.calledNotificationStatus || "") === "sent" && ticket.calledNotificationSentAt) {
    return { ok: true, status: "sent", stateChanged: false, duplicate: true };
  }

  const attemptedAt = new Date();
  const station = await Station.findById(ticket.stationId).select("_id name address").lean();
  const io = getIO();

  if (!io) {
    await updateTicketNotification(ticket._id, {
      calledNotificationStatus: "failed",
      calledNotificationChannel: "in_app_alert",
      calledNotificationSentAt: null,
      calledNotificationLastAttemptAt: attemptedAt,
      calledNotificationError: "Realtime alert service is unavailable."
    });
    return {
      ok: false,
      status: "failed",
      channel: "in_app_alert",
      error: "Realtime alert service is unavailable.",
      stateChanged: true
    };
  }

  try {
    const payload = {
      alertId: `queue_turn_${String(ticket._id)}`,
      type: "queue_turn_called",
      ticketId: String(ticket._id),
      reservationCode: trimText(ticket.publicTicketCode),
      userId: String(ticket.userId || ""),
      stationId: String(ticket.stationId || ""),
      stationName: trimText(station?.name) || "Fuel Station",
      address: trimText(station?.address),
      fuelType: trimText(ticket?.fuelType),
      requestedLiters: Number(ticket?.requestedLiters || 0),
      estimatedAmount: Number(ticket?.estimatedAmount || 0),
      title: "It's your turn",
      message: buildQueueTurnMessage({
        stationName: station?.name,
        reservationCode: ticket.publicTicketCode,
        callWindowMinutes,
      }),
      callWindowMinutes,
      expiresAt: ticket?.expiresAt || null,
      sentAt: attemptedAt.toISOString()
    };

    io.to(userRoom(ticket.userId)).emit("queue_turn_alert", payload);

    await updateTicketNotification(ticket._id, {
      calledNotificationStatus: "sent",
      calledNotificationChannel: "in_app_alert",
      calledNotificationSentAt: attemptedAt,
      calledNotificationLastAttemptAt: attemptedAt,
      calledNotificationError: ""
    });

    return {
      ok: true,
      status: "sent",
      channel: "in_app_alert",
      payload,
      stateChanged: true
    };
  } catch (error) {
    await updateTicketNotification(ticket._id, {
      calledNotificationStatus: "failed",
      calledNotificationChannel: "in_app_alert",
      calledNotificationSentAt: null,
      calledNotificationLastAttemptAt: attemptedAt,
      calledNotificationError: trimText(error?.message) || "Failed to send queue turn notification."
    });

    return {
      ok: false,
      status: "failed",
      channel: "in_app_alert",
      error: trimText(error?.message) || "Failed to send queue turn notification.",
      stateChanged: true
    };
  }
}

module.exports = { notifyCustomerWhenTicketCalled };
