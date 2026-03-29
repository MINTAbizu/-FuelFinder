const mongoose = require("mongoose");
const Station = require("../models/Station");
const {
  normalizePaymentDetails,
  pickPaymentDetailsPayload
} = require("../utils/stationPaymentDetails");
const {
  normalizeLocationCategories,
  resolveStationLocation
} = require("../utils/locationDirectory");

const STATION_POPULATE = [
  { path: "regionId", select: "name slug code category countryCode isActive" },
  { path: "cityId", select: "name slug code regionId isActive" },
  { path: "woredaId", select: "name slug code category regionId cityId isActive" }
];
const DEFAULT_STATION_PAGE = 1;
const DEFAULT_STATION_LIMIT = 50;
const MAX_STATION_LIMIT = 200;

function asText(value) {
  return String(value || "").trim();
}

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function asPositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value || "").trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function asObjectIdOrNull(value, fieldName) {
  const text = asText(value);
  if (!text) return null;
  if (!mongoose.isValidObjectId(text)) {
    throw new Error(`${fieldName} must be a valid ObjectId.`);
  }
  return text;
}

function asNumber(value, fieldName) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    throw new Error(`${fieldName} must be a valid number.`);
  }
  return num;
}

function extractId(value) {
  if (!value) return null;
  if (typeof value === "object" && value._id) return String(value._id);
  return String(value);
}

function buildRegionPayload(value) {
  if (!value || typeof value !== "object" || !value._id) return null;
  return {
    id: String(value._id),
    name: value.name || "",
    slug: value.slug || "",
    code: value.code || "",
    category: value.category || "regional_state",
    countryCode: value.countryCode || "ET",
    isActive: Boolean(value.isActive)
  };
}

function buildCityPayload(value) {
  if (!value || typeof value !== "object" || !value._id) return null;
  return {
    id: String(value._id),
    name: value.name || "",
    slug: value.slug || "",
    code: value.code || "",
    regionId: extractId(value.regionId),
    isActive: Boolean(value.isActive)
  };
}

function buildWoredaPayload(value) {
  if (!value || typeof value !== "object" || !value._id) return null;
  return {
    id: String(value._id),
    name: value.name || "",
    slug: value.slug || "",
    code: value.code || "",
    category: value.category || "woreda",
    regionId: extractId(value.regionId),
    cityId: extractId(value.cityId),
    isActive: Boolean(value.isActive)
  };
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
  const region = buildRegionPayload(station.regionId);
  const city = buildCityPayload(station.cityId);
  const woredaDirectory = buildWoredaPayload(station.woredaId);

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
    chapaSubaccountId: station.chapaSubaccountId || "",
    isActive: Boolean(station.isActive),
    organizationId: station.organizationId ? String(station.organizationId) : null,
    regionId: region ? region.id : extractId(station.regionId),
    region,
    cityId: city ? city.id : extractId(station.cityId),
    city,
    woredaId: woredaDirectory ? woredaDirectory.id : extractId(station.woredaId),
    woredaDirectory,
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

async function loadStationForResponse(stationId) {
  return Station.findById(stationId)
    .populate(STATION_POPULATE)
    .lean();
}

function isOrgAdmin(req) {
  return String(req?.user?.role || "") === "org_admin";
}

function isSuperAdmin(req) {
  return String(req?.user?.role || "") === "super_admin";
}

function getActorOrgId(req) {
  return String(req?.user?.organizationId || "").trim();
}

exports.listStations = async (req, res) => {
  try {
    const query = {};
    const q = asText(req.query.q);
    const requestedPage = asPositiveInt(req.query.page, DEFAULT_STATION_PAGE);
    const requestedLimit = Math.min(
      asPositiveInt(req.query.limit, DEFAULT_STATION_LIMIT),
      MAX_STATION_LIMIT
    );
    const usePagination = req.query.page !== undefined || req.query.limit !== undefined;

    if (req.query.isActive === "true") query.isActive = true;
    if (req.query.isActive === "false") query.isActive = false;

    const organizationId = asText(req.query.organizationId);
    if (organizationId) {
      if (!mongoose.isValidObjectId(organizationId)) {
        return res.status(400).json({ message: "organizationId must be a valid ObjectId." });
      }
      query.organizationId = organizationId;
    }

    const regionId = asText(req.query.regionId);
    if (regionId) {
      if (!mongoose.isValidObjectId(regionId)) {
        return res.status(400).json({ message: "regionId must be a valid ObjectId." });
      }
      query.regionId = regionId;
    }

    const cityId = asText(req.query.cityId);
    if (cityId) {
      if (!mongoose.isValidObjectId(cityId)) {
        return res.status(400).json({ message: "cityId must be a valid ObjectId." });
      }
      query.cityId = cityId;
    }

    const woredaId = asText(req.query.woredaId);
    if (woredaId) {
      if (!mongoose.isValidObjectId(woredaId)) {
        return res.status(400).json({ message: "woredaId must be a valid ObjectId." });
      }
      query.woredaId = woredaId;
    }

    const branchId = asText(req.query.branchId);
    if (branchId) {
      if (!mongoose.isValidObjectId(branchId)) {
        return res.status(400).json({ message: "branchId must be a valid ObjectId." });
      }
      query.branchId = branchId;
    }

    const locationCategory = asText(req.query.locationCategory).toLowerCase();
    if (locationCategory) {
      query.locationCategories = locationCategory;
    }
    if (q) {
      const regex = new RegExp(escapeRegex(q), "i");
      query.$or = [
        { name: regex },
        { address: regex },
        { contact: regex },
        { subcity: regex },
        { woreda: regex },
        { landmark: regex }
      ];
    }

    if (isOrgAdmin(req)) {
      const actorOrgId = getActorOrgId(req);
      if (!actorOrgId) {
        return res.status(403).json({ message: "Forbidden: organization scope not configured." });
      }
      query.organizationId = actorOrgId;
    }

    const total = await Station.countDocuments(query);
    const totalPages = usePagination ? Math.max(1, Math.ceil(total / requestedLimit)) : (total > 0 ? 1 : 0);
    const page = usePagination ? Math.min(requestedPage, Math.max(totalPages, 1)) : 1;
    const stationQuery = Station.find(query)
      .populate(STATION_POPULATE)
      .sort({ updatedAt: -1, createdAt: -1, _id: -1 });

    if (usePagination) {
      stationQuery.skip((page - 1) * requestedLimit).limit(requestedLimit);
    }

    const stations = await stationQuery.lean();

    return res.json({
      total,
      page,
      limit: usePagination ? requestedLimit : stations.length,
      totalPages,
      hasPreviousPage: usePagination ? page > 1 : false,
      hasNextPage: usePagination ? page < totalPages : false,
      stations: stations.map((station) => buildStationResponse(station))
    });
  } catch (_err) {
    return res.status(500).json({ message: "Failed to load stations." });
  }
};

exports.createStation = async (req, res) => {
  try {
    const name = asText(req.body.name);
    const address = asText(req.body.address);
    const contact = asText(req.body.contact);
    const fuelStatus = asText(req.body.fuelStatus) || "partial";
    const latitude = asNumber(req.body.latitude, "latitude");
    const longitude = asNumber(req.body.longitude, "longitude");
    const paymentDetails = pickPaymentDetailsPayload(req.body);
    let organizationId = asObjectIdOrNull(req.body.organizationId, "organizationId");
    const requestedRegionId = asObjectIdOrNull(req.body.regionId, "regionId");
    const requestedCityId = asObjectIdOrNull(req.body.cityId, "cityId");
    const requestedWoredaId = asObjectIdOrNull(req.body.woredaId, "woredaId");
    const branchId = asObjectIdOrNull(req.body.branchId, "branchId");
    const locationCategories = normalizeLocationCategories(req.body.locationCategories);

    if (!name || !address) {
      return res.status(400).json({ message: "name and address are required." });
    }
    if (!["full", "partial", "empty"].includes(fuelStatus)) {
      return res.status(400).json({ message: "fuelStatus must be one of: full, partial, empty." });
    }
    if (req.body.chapaSubaccountId !== undefined && !isSuperAdmin(req)) {
      return res.status(403).json({ message: "Only super admin can set chapa subaccount id." });
    }
    if (isOrgAdmin(req)) {
      const actorOrgId = getActorOrgId(req);
      if (!actorOrgId) {
        return res.status(403).json({ message: "Forbidden: organization scope not configured." });
      }
      if (organizationId && organizationId !== actorOrgId) {
        return res.status(403).json({ message: "Forbidden: cannot create station for another organization." });
      }
      organizationId = actorOrgId;
    }
    if (latitude < -90 || latitude > 90) {
      return res.status(400).json({ message: "latitude must be between -90 and 90." });
    }
    if (longitude < -180 || longitude > 180) {
      return res.status(400).json({ message: "longitude must be between -180 and 180." });
    }

    const resolvedLocation = await resolveStationLocation({
      regionId: requestedRegionId,
      cityId: requestedCityId,
      woredaId: requestedWoredaId
    });

    const station = await Station.create({
      name,
      address,
      contact,
      ...(paymentDetails ? { paymentDetails: normalizePaymentDetails(paymentDetails) } : {}),
      chapaSubaccountId: asText(req.body.chapaSubaccountId),
      fuelStatus,
      isActive: req.body.isActive !== undefined ? Boolean(req.body.isActive) : true,
      organizationId,
      regionId: resolvedLocation.regionId,
      cityId: resolvedLocation.cityId,
      woredaId: resolvedLocation.woredaId,
      branchId,
      subcity: asText(req.body.subcity),
      woreda: asText(req.body.woreda || resolvedLocation.woreda?.name),
      landmark: asText(req.body.landmark),
      locationCategories,
      location: {
        type: "Point",
        coordinates: [longitude, latitude]
      }
    });

    const stationDoc = await loadStationForResponse(station._id);

    return res.status(201).json({
      message: "Station created successfully.",
      station: buildStationResponse(stationDoc || station)
    });
  } catch (err) {
    if (err instanceof Error && err.message.includes("must be a valid")) {
      return res.status(400).json({ message: err.message });
    }
    if (err instanceof Error && err.message.includes("does not exist")) {
      return res.status(400).json({ message: err.message });
    }
    if (err instanceof Error && err.message.includes("does not belong")) {
      return res.status(400).json({ message: err.message });
    }
    return res.status(500).json({ message: "Failed to create station." });
  }
};

exports.updateStation = async (req, res) => {
  try {
    const stationId = asText(req.params.stationId);
    if (!mongoose.isValidObjectId(stationId)) {
      return res.status(400).json({ message: "Invalid station id." });
    }

    const station = await Station.findById(stationId);
    if (!station) {
      return res.status(404).json({ message: "Station not found." });
    }
    if (isOrgAdmin(req)) {
      const actorOrgId = getActorOrgId(req);
      if (!actorOrgId) {
        return res.status(403).json({ message: "Forbidden: organization scope not configured." });
      }
      const stationOrg = station.organizationId ? String(station.organizationId) : "";
      if (!stationOrg || stationOrg !== actorOrgId) {
        return res.status(403).json({ message: "Forbidden: cannot update station outside your organization." });
      }
    }

    if (req.body.name !== undefined) {
      const name = asText(req.body.name);
      if (!name) return res.status(400).json({ message: "name cannot be empty." });
      station.name = name;
    }
    if (req.body.address !== undefined) {
      const address = asText(req.body.address);
      if (!address) return res.status(400).json({ message: "address cannot be empty." });
      station.address = address;
    }
    if (req.body.contact !== undefined) {
      station.contact = asText(req.body.contact);
    }
    if (req.body.subcity !== undefined) {
      station.subcity = asText(req.body.subcity);
    }
    if (req.body.woreda !== undefined) {
      station.woreda = asText(req.body.woreda);
    }
    if (req.body.landmark !== undefined) {
      station.landmark = asText(req.body.landmark);
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
    if (req.body.chapaSubaccountId !== undefined) {
      if (!isSuperAdmin(req)) {
        return res.status(403).json({ message: "Only super admin can set chapa subaccount id." });
      }
      station.chapaSubaccountId = asText(req.body.chapaSubaccountId);
    }
    if (req.body.fuelStatus !== undefined) {
      const fuelStatus = asText(req.body.fuelStatus);
      if (!["full", "partial", "empty"].includes(fuelStatus)) {
        return res.status(400).json({ message: "fuelStatus must be one of: full, partial, empty." });
      }
      station.fuelStatus = fuelStatus;
    }
    if (req.body.organizationId !== undefined) {
      const requestedOrganizationId = asObjectIdOrNull(req.body.organizationId, "organizationId");
      if (isOrgAdmin(req)) {
        const actorOrgId = getActorOrgId(req);
        if (!actorOrgId || (requestedOrganizationId && requestedOrganizationId !== actorOrgId)) {
          return res.status(403).json({ message: "Forbidden: cannot move station to another organization." });
        }
        station.organizationId = actorOrgId;
      } else {
        station.organizationId = requestedOrganizationId;
      }
    }
    if (req.body.branchId !== undefined) {
      station.branchId = asObjectIdOrNull(req.body.branchId, "branchId");
    }
    if (req.body.regionId !== undefined || req.body.cityId !== undefined || req.body.woredaId !== undefined) {
      const requestedRegionId = req.body.regionId !== undefined
        ? asObjectIdOrNull(req.body.regionId, "regionId")
        : station.regionId;
      const requestedCityId = req.body.cityId !== undefined
        ? asObjectIdOrNull(req.body.cityId, "cityId")
        : station.cityId;
      const requestedWoredaId = req.body.woredaId !== undefined
        ? asObjectIdOrNull(req.body.woredaId, "woredaId")
        : station.woredaId;

      const resolvedLocation = await resolveStationLocation({
        regionId: requestedRegionId,
        cityId: requestedCityId,
        woredaId: requestedWoredaId
      });

      station.regionId = resolvedLocation.regionId;
      station.cityId = resolvedLocation.cityId;
      station.woredaId = resolvedLocation.woredaId;
      if (req.body.woreda === undefined && resolvedLocation.woreda?.name) {
        station.woreda = resolvedLocation.woreda.name;
      }
    }
    if (req.body.isActive !== undefined) {
      station.isActive = Boolean(req.body.isActive);
    }
    if (req.body.latitude !== undefined || req.body.longitude !== undefined) {
      const currentCoords = Array.isArray(station.location?.coordinates)
        ? station.location.coordinates
        : [0, 0];
      const longitude = req.body.longitude !== undefined
        ? asNumber(req.body.longitude, "longitude")
        : Number(currentCoords[0]);
      const latitude = req.body.latitude !== undefined
        ? asNumber(req.body.latitude, "latitude")
        : Number(currentCoords[1]);
      if (latitude < -90 || latitude > 90) {
        return res.status(400).json({ message: "latitude must be between -90 and 90." });
      }
      if (longitude < -180 || longitude > 180) {
        return res.status(400).json({ message: "longitude must be between -180 and 180." });
      }
      station.location = {
        type: "Point",
        coordinates: [longitude, latitude]
      };
    }

    await station.save();
    const stationDoc = await loadStationForResponse(station._id);

    return res.json({
      message: "Station updated successfully.",
      station: buildStationResponse(stationDoc || station)
    });
  } catch (err) {
    if (err instanceof Error && err.message.includes("must be a valid")) {
      return res.status(400).json({ message: err.message });
    }
    if (err instanceof Error && err.message.includes("does not exist")) {
      return res.status(400).json({ message: err.message });
    }
    if (err instanceof Error && err.message.includes("does not belong")) {
      return res.status(400).json({ message: err.message });
    }
    return res.status(500).json({ message: "Failed to update station." });
  }
};

exports.setStationActive = async (req, res) => {
  try {
    const stationId = asText(req.params.stationId);
    if (!mongoose.isValidObjectId(stationId)) {
      return res.status(400).json({ message: "Invalid station id." });
    }

    const station = await Station.findById(stationId);
    if (!station) {
      return res.status(404).json({ message: "Station not found." });
    }
    if (isOrgAdmin(req)) {
      const actorOrgId = getActorOrgId(req);
      if (!actorOrgId) {
        return res.status(403).json({ message: "Forbidden: organization scope not configured." });
      }
      const stationOrg = station.organizationId ? String(station.organizationId) : "";
      if (!stationOrg || stationOrg !== actorOrgId) {
        return res.status(403).json({ message: "Forbidden: cannot update station outside your organization." });
      }
    }

    station.isActive = Boolean(req.body?.isActive);
    await station.save();
    const stationDoc = await loadStationForResponse(station._id);

    return res.json({
      message: station.isActive ? "Station activated." : "Station deactivated.",
      station: buildStationResponse(stationDoc || station)
    });
  } catch (_err) {
    return res.status(500).json({ message: "Failed to update station status." });
  }
};
