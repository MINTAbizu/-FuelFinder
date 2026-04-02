function normalizeStationType(value) {
  const stationType = String(value || "").trim().toLowerCase();
  if (stationType === "fuel" || stationType === "electric") {
    return stationType;
  }
  return "";
}

function getStationTypeForResponse(value) {
  return normalizeStationType(value) || "fuel";
}

function applyStationTypeFilter(query = {}, value, { fieldName = "stationType" } = {}) {
  const stationType = normalizeStationType(value);
  if (!stationType) return query;

  if (stationType === "electric") {
    query[fieldName] = "electric";
    return query;
  }

  const fuelFallbackCondition = {
    $or: [
      { [fieldName]: "fuel" },
      { [fieldName]: { $exists: false } },
      { [fieldName]: null }
    ]
  };

  query.$and = Array.isArray(query.$and)
    ? [...query.$and, fuelFallbackCondition]
    : [fuelFallbackCondition];

  return query;
}

module.exports = {
  applyStationTypeFilter,
  getStationTypeForResponse,
  normalizeStationType
};
