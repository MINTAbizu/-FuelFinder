const mongoose = require("mongoose");
const Station = require("../models/Station");
const {
  normalizePaymentDetails,
  pickPaymentDetailsPayload
} = require("../utils/stationPaymentDetails");
const {
  buildFuelPricesResponse,
  normalizeFuelPrices,
  pickFuelPricesPayload
} = require("../utils/stationFuelPrices");
const { normalizeLocationCategories } = require("../utils/locationDirectory");
const {
  getAssignedStationIds,
  isAssignedStationOnlyRole
} = require("../utils/stationScope");

function deriveFuelStatusFromInventory(inventory) {
  const gasoline = Number(inventory?.gasolineLiters || 0);
  const diesel = Number(inventory?.dieselLiters || 0);
  const other = Number(inventory?.otherLiters || 0);
  const total = gasoline + diesel + other;
  if (total <= 0) return "empty";
  if (total <= 300) return "partial";
  return "full";
}

function hasManagedFuelInventory(inventory) {
  const gasoline = Number(inventory?.gasolineLiters || 0);
  const diesel = Number(inventory?.dieselLiters || 0);
  const other = Number(inventory?.otherLiters || 0);
  return Boolean(inventory?.updatedAt) || gasoline > 0 || diesel > 0 || other > 0;
}

function resolveStationFuelStatus(station = {}) {
  const inventory = station?.fuelInventory || {};
  if (hasManagedFuelInventory(inventory)) {
    return deriveFuelStatusFromInventory(inventory);
  }

  const storedStatus = String(station?.fuelStatus || "").trim().toLowerCase();
  if (storedStatus === "full" || storedStatus === "partial" || storedStatus === "empty") {
    return storedStatus;
  }

  return deriveFuelStatusFromInventory(inventory);
}

function buildStationResponse(station) {
  const coords = Array.isArray(station.location?.coordinates) ? station.location.coordinates : [];
  const fuelInventory = station.fuelInventory || {};
  return {
    id: String(station._id),
    name: station.name || "",
    address: station.address || "",
    contact: station.contact || "",
    fuelStatus: resolveStationFuelStatus(station),
    fuelInventory: {
      gasolineLiters: Number(fuelInventory.gasolineLiters || 0),
      dieselLiters: Number(fuelInventory.dieselLiters || 0),
      otherLiters: Number(fuelInventory.otherLiters || 0),
      updatedAt: fuelInventory.updatedAt || null,
      updatedByUserId: fuelInventory.updatedByUserId ? String(fuelInventory.updatedByUserId) : null
    },
    paymentDetails: normalizePaymentDetails(station.paymentDetails),
    ...buildFuelPricesResponse(station.fuelPrices),
    chapaSubaccountId: station.chapaSubaccountId || "",
    isActive: Boolean(station.isActive),
    organizationId: station.organizationId ? String(station.organizationId) : null,
    regionId: station.regionId ? String(station.regionId) : null,
    cityId: station.cityId ? String(station.cityId) : null,
    woredaId: station.woredaId ? String(station.woredaId) : null,
    branchId: station.branchId ? String(station.branchId) : null,
    subcity: station.subcity || "",
    woreda: station.woreda || "",
    landmark: station.landmark || "",
    locationCategories: Array.isArray(station.locationCategories) ? station.locationCategories : [],
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
  const stationIds = getAssignedStationIds(user);

  if (stationIds.length) {
    query._id = { $in: stationIds };
    return query;
  }

  if (isAssignedStationOnlyRole(user)) {
    return null;
  }

  const organizationId = String(user.organizationId || "").trim();
  if (organizationId) {
    query.organizationId = organizationId;
    return query;
  }

  return null;
}

function canUpdateChapaSubaccount(user = {}) {
  const role = String(user.role || "").trim();
  return role === "station_manager" || role === "super_admin";
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

exports.updateMyStation = async (req, res) => {
  try {
    const stationId = String(req.params.stationId || "").trim();
    if (!mongoose.isValidObjectId(stationId)) {
      return res.status(400).json({ message: "Invalid station id." });
    }

    const scopeQuery = resolveStationScopeQuery(req.user || {});
    if (!scopeQuery) {
      return res.status(403).json({ message: "No station scope assigned to this account." });
    }

    const station = await Station.findOne({ ...scopeQuery, _id: stationId });
    if (!station) {
      return res.status(404).json({ message: "Station not found for your account." });
    }

    if (req.body.name !== undefined) {
      const nextName = String(req.body.name || "").trim();
      if (!nextName) return res.status(400).json({ message: "name cannot be empty." });
      station.name = nextName;
    }
    if (req.body.address !== undefined) {
      const nextAddress = String(req.body.address || "").trim();
      if (!nextAddress) return res.status(400).json({ message: "address cannot be empty." });
      station.address = nextAddress;
    }
    if (req.body.contact !== undefined) {
      station.contact = String(req.body.contact || "").trim();
    }
    if (req.body.subcity !== undefined) {
      station.subcity = String(req.body.subcity || "").trim();
    }
    if (req.body.woreda !== undefined) {
      station.woreda = String(req.body.woreda || "").trim();
    }
    if (req.body.landmark !== undefined) {
      station.landmark = String(req.body.landmark || "").trim();
    }
    if (req.body.locationCategories !== undefined) {
      station.locationCategories = normalizeLocationCategories(req.body.locationCategories);
    }
    const paymentDetails = pickPaymentDetailsPayload(req.body);
    if (paymentDetails) {
      station.paymentDetails = {
        ...normalizePaymentDetails(station.paymentDetails),
        ...paymentDetails
      };
    }
    const fuelPrices = pickFuelPricesPayload(req.body);
    if (fuelPrices) {
      station.fuelPrices = {
        ...normalizeFuelPrices(station.fuelPrices),
        ...fuelPrices
      };
    }
    if (req.body.chapaSubaccountId !== undefined) {
      if (!canUpdateChapaSubaccount(req.user)) {
        return res.status(403).json({
          message: "Only station managers or super admin can set chapa subaccount id."
        });
      }
      station.chapaSubaccountId = String(req.body.chapaSubaccountId || "").trim();
    }
    if (req.body.isActive !== undefined) {
      station.isActive = Boolean(req.body.isActive);
    }

    await station.save();

    return res.json({
      message: "Station updated.",
      station: buildStationResponse(station)
    });
  } catch (_error) {
    return res.status(500).json({ message: "Failed to update station." });
  }
};
