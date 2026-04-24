const MAX_RESERVATION_COOLDOWN_DAYS = 3650;

function normalizeReservationCooldownDays(
  value,
  fieldLabel = "reservationCooldownDays"
) {
  if (value === undefined || value === null) return 0;
  if (typeof value === "string" && !value.trim()) return 0;

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || !Number.isInteger(parsed)) {
    throw new Error(`${fieldLabel} must be a non-negative whole number.`);
  }
  if (parsed > MAX_RESERVATION_COOLDOWN_DAYS) {
    throw new Error(
      `${fieldLabel} cannot be greater than ${MAX_RESERVATION_COOLDOWN_DAYS}.`
    );
  }

  return parsed;
}

module.exports = {
  MAX_RESERVATION_COOLDOWN_DAYS,
  normalizeReservationCooldownDays
};
