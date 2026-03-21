const StationFuelSnapshot = require("../models/StationFuelSnapshot");

function resolveRecordedAt(value) {
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function normalizeFuelInventory(inventory = {}) {
  return {
    gasolineLiters: Number(inventory.gasolineLiters || 0),
    dieselLiters: Number(inventory.dieselLiters || 0),
    otherLiters: Number(inventory.otherLiters || 0)
  };
}

async function recordStationFuelSnapshot({
  station,
  source = "unknown",
  actorUserId = null,
  recordedAt = null
} = {}) {
  if (!station?._id) return null;

  const inventory = normalizeFuelInventory(station.fuelInventory || {});

  return StationFuelSnapshot.create({
    stationId: station._id,
    actorUserId: actorUserId || null,
    source: String(source || "unknown").trim() || "unknown",
    fuelStatus: String(station.fuelStatus || "partial").trim().toLowerCase() || "partial",
    fuelInventory: inventory,
    recordedAt: resolveRecordedAt(recordedAt || station?.fuelInventory?.updatedAt || station?.updatedAt)
  });
}

module.exports = {
  recordStationFuelSnapshot
};
