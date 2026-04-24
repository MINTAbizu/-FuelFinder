const QueueTicket = require("../models/QueueTicket");
const {
  normalizeReservationCooldownDays
} = require("../utils/stationReservationPolicy");

function addDays(date, days) {
  const baseDate = date instanceof Date ? date : new Date(date);
  const nextDate = new Date(baseDate.getTime());
  nextDate.setDate(nextDate.getDate() + Number(days || 0));
  return nextDate;
}

async function getReservationCooldownStatus({
  userId,
  stationId,
  reservationCooldownDays,
  excludeReservationId = null
}) {
  const cooldownDays = normalizeReservationCooldownDays(reservationCooldownDays);
  if (!cooldownDays || !userId || !stationId) return null;

  const query = {
    userId,
    stationId,
    depositPaidAt: { $ne: null }
  };

  if (excludeReservationId) {
    query._id = { $ne: excludeReservationId };
  }

  const lastPaidTicket = await QueueTicket.findOne(query)
    .sort({ depositPaidAt: -1, updatedAt: -1, _id: -1 })
    .select("_id publicTicketCode depositPaidAt")
    .lean();

  if (!lastPaidTicket?.depositPaidAt) return null;

  const nextEligibleAt = addDays(lastPaidTicket.depositPaidAt, cooldownDays);
  if (nextEligibleAt <= new Date()) return null;

  return {
    reservationCooldownDays: cooldownDays,
    lastReservationId: String(lastPaidTicket._id),
    lastReservationCode: String(lastPaidTicket.publicTicketCode || ""),
    lastPaidAt: lastPaidTicket.depositPaidAt,
    nextEligibleAt
  };
}

function buildReservationCooldownPayload(station = {}, cooldown = {}) {
  const cooldownDays = Number(cooldown?.reservationCooldownDays || 0);
  return {
    message:
      cooldownDays > 0
        ? `This station allows one paid reservation every ${cooldownDays} day(s).`
        : "Repeat paid reservations are temporarily restricted for this station.",
    reason: "reservation_cooldown_active",
    stationId: station?._id ? String(station._id) : String(station?.stationId || ""),
    stationName: String(station?.name || ""),
    reservationCooldownDays: cooldownDays,
    lastReservationId: String(cooldown?.lastReservationId || ""),
    lastReservationCode: String(cooldown?.lastReservationCode || ""),
    lastPaidAt: cooldown?.lastPaidAt || null,
    nextEligibleAt: cooldown?.nextEligibleAt || null
  };
}

module.exports = {
  buildReservationCooldownPayload,
  getReservationCooldownStatus
};
