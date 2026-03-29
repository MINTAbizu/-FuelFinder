const QueueTicket = require("../models/QueueTicket");
const Station = require("../models/Station");
const User = require("../models/User");
const { getIO, userRoom } = require("../socket");
const { isExpoPushToken, sendExpoPushNotifications } = require("./pushNotificationService");

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
  const user = await User.findById(ticket.userId).select("_id pushTokens").lean();

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

  const notificationChannels = [];
  const notificationErrors = [];
  let sentAt = null;
  try {
    if (io) {
      io.to(userRoom(ticket.userId)).emit("queue_turn_alert", payload);
      notificationChannels.push("in_app_alert");
      sentAt = attemptedAt;
    } else {
      notificationErrors.push("Realtime alert service is unavailable.");
    }

    const expoTokens = (Array.isArray(user?.pushTokens) ? user.pushTokens : [])
      .map((item) => trimText(item?.token))
      .filter(isExpoPushToken);

    if (expoTokens.length) {
      const pushResult = await sendExpoPushNotifications(
        expoTokens.map((token) => ({
          to: token,
          title: payload.title,
          body: payload.message,
          sound: "default",
          channelId: "fuel-alerts",
          data: {
            alertId: payload.alertId,
            type: payload.type,
            ticketId: payload.ticketId,
            reservationCode: payload.reservationCode,
            stationId: payload.stationId,
            stationName: payload.stationName,
            address: payload.address,
            callWindowMinutes: payload.callWindowMinutes,
            sentAt: payload.sentAt,
          },
        }))
      );

      if (pushResult.sentCount > 0) {
        notificationChannels.push("push_notification");
        sentAt = sentAt || attemptedAt;
      }

      if (pushResult.invalidTokens.length) {
        await User.updateOne(
          { _id: user?._id || ticket.userId },
          {
            $pull: {
              pushTokens: {
                token: { $in: pushResult.invalidTokens },
              },
            },
          }
        ).catch(() => null);
      }

      notificationErrors.push(...pushResult.errors);
    }

    if (notificationChannels.length) {
      await updateTicketNotification(ticket._id, {
        calledNotificationStatus: "sent",
        calledNotificationChannel: notificationChannels.join(","),
        calledNotificationSentAt: sentAt,
        calledNotificationLastAttemptAt: attemptedAt,
        calledNotificationError: notificationErrors.join(" | ").slice(0, 500),
      });

      return {
        ok: true,
        status: "sent",
        channel: notificationChannels.join(","),
        payload,
        stateChanged: true,
      };
    }

    const failureMessage =
      notificationErrors.find(Boolean) || "Failed to send queue turn notification.";
    await updateTicketNotification(ticket._id, {
      calledNotificationStatus: "failed",
      calledNotificationChannel: "",
      calledNotificationSentAt: null,
      calledNotificationLastAttemptAt: attemptedAt,
      calledNotificationError: failureMessage,
    });

    return {
      ok: false,
      status: "failed",
      channel: "",
      error: failureMessage,
      stateChanged: true,
    };
  } catch (error) {
    const failureMessage =
      trimText(error?.message) ||
      notificationErrors.find(Boolean) ||
      "Failed to send queue turn notification.";
    await updateTicketNotification(ticket._id, {
      calledNotificationStatus: "failed",
      calledNotificationChannel: notificationChannels.join(","),
      calledNotificationSentAt: sentAt,
      calledNotificationLastAttemptAt: attemptedAt,
      calledNotificationError: failureMessage,
    });

    return {
      ok: false,
      status: "failed",
      channel: notificationChannels.join(","),
      error: failureMessage,
      stateChanged: true,
    };
  }
}

module.exports = { notifyCustomerWhenTicketCalled };
