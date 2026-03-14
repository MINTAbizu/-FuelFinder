const mongoose = require("mongoose");
const Station = require("../models/Station");

function buildStationResponse(station) {
  const coords = Array.isArray(station.location?.coordinates) ? station.location.coordinates : [];
  const fuelInventory = station.fuelInventory || {};
  return {
    id: String(station._id),
    name: station.name || "",
    address: station.address || "",
    contact: station.contact || "",
    fuelStatus: station.fuelStatus || "partial",
    fuelInventory: {
      gasolineLiters: Number(fuelInventory.gasolineLiters || 0),
      dieselLiters: Number(fuelInventory.dieselLiters || 0),
      otherLiters: Number(fuelInventory.otherLiters || 0),
      updatedAt: fuelInventory.updatedAt || null,
      updatedByUserId: fuelInventory.updatedByUserId ? String(fuelInventory.updatedByUserId) : null
    },
    isActive: Boolean(station.isActive),
    organizationId: station.organizationId ? String(station.organizationId) : null,
    cityId: station.cityId ? String(station.cityId) : null,
    branchId: station.branchId ? String(station.branchId) : null,
    latitude: coords.length >= 2 ? Number(coords[1]) : null,
    longitude: coords.length >= 2 ? Number(coords[0]) : null,
    createdAt: station.createdAt,
    updatedAt: station.updatedAt
  };
}

function resolveStationScopeQuery(user) {
  if (String(user.role || "") === "super_admin") {
    return {};
  }

  const query = {};
  const stationIds = Array.isArray(user.stationIds)
    ? user.stationIds.map((value) => String(value))
    : [];

  if (stationIds.length) {
    query._id = { $in: stationIds };
    return query;
  }

  const organizationId = String(user.organizationId || "").trim();
  if (organizationId) {
    query.organizationId = organizationId;
    return query;
  }

  return null;
}

exports.listMyStations = async (req, res) => {
  try {
    const scopeQuery = resolveStationScopeQuery(req.user || {});
    if (!scopeQuery) {
      return res.status(403).json({ message: "No station scope assigned to this account." });
    }

    const stations = await Station.find(scopeQuery).sort({ createdAt: -1 }).lean();
    return res.json({
      total: stations.length,
      stations: stations.map((station) => buildStationResponse(station))
    });
  } catch (_error) {
    return res.status(500).json({ message: "Failed to load stations." });
  }
};

exports.getMyStation = async (req, res) => {
  try {
    const stationId = String(req.params.stationId || "").trim();
    if (!mongoose.isValidObjectId(stationId)) {
      return res.status(400).json({ message: "Invalid station id." });
    }

    const scopeQuery = resolveStationScopeQuery(req.user || {});
    if (!scopeQuery) {
      return res.status(403).json({ message: "No station scope assigned to this account." });
    }

    const station = await Station.findOne({ ...scopeQuery, _id: stationId }).lean();
    if (!station) {
      return res.status(404).json({ message: "Station not found for your account." });
    }

    return res.json({ station: buildStationResponse(station) });
  } catch (_error) {
    return res.status(500).json({ message: "Failed to load station." });
  }
};
