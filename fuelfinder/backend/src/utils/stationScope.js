function getActorRole(user = {}) {
  return String(user.role || "").trim().toLowerCase();
}

function getAssignedStationIds(user = {}) {
  if (!Array.isArray(user.stationIds)) return [];
  return user.stationIds
    .map((value) => String(value || "").trim())
    .filter(Boolean);
}

function isAssignedStationOnlyRole(user = {}) {
  return getActorRole(user) === "station_manager";
}

function hasAssignedStationAccess(user = {}, stationId) {
  return getAssignedStationIds(user).includes(String(stationId || "").trim());
}

module.exports = {
  getActorRole,
  getAssignedStationIds,
  hasAssignedStationAccess,
  isAssignedStationOnlyRole
};
