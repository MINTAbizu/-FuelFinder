const mongoose = require("mongoose");
const Station = require("../models/Station");

function asText(value) {
  return String(value || "").trim();
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
    chapaSubaccountId: station.chapaSubaccountId || "",
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

function isOrgAdmin(req) {
  return String(req?.user?.role || "") === "org_admin";
}

function getActorOrgId(req) {
  return String(req?.user?.organizationId || "").trim();
}

exports.listStations = async (req, res) => {
  try {
    const query = {};
    if (req.query.isActive === "true") query.isActive = true;
    if (req.query.isActive === "false") query.isActive = false;

    const organizationId = asText(req.query.organizationId);
    if (organizationId) {
      if (!mongoose.isValidObjectId(organizationId)) {
        return res.status(400).json({ message: "organizationId must be a valid ObjectId." });
      }
      query.organizationId = organizationId;
    }

    const cityId = asText(req.query.cityId);
    if (cityId) {
      if (!mongoose.isValidObjectId(cityId)) {
        return res.status(400).json({ message: "cityId must be a valid ObjectId." });
      }
      query.cityId = cityId;
    }

    const branchId = asText(req.query.branchId);
    if (branchId) {
      if (!mongoose.isValidObjectId(branchId)) {
        return res.status(400).json({ message: "branchId must be a valid ObjectId." });
      }
      query.branchId = branchId;
    }

    if (isOrgAdmin(req)) {
      const actorOrgId = getActorOrgId(req);
      if (!actorOrgId) {
        return res.status(403).json({ message: "Forbidden: organization scope not configured." });
      }
      query.organizationId = actorOrgId;
    }

    const stations = await Station.find(query).sort({ createdAt: -1 }).lean();
    return res.json({
      total: stations.length,
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
    let organizationId = asObjectIdOrNull(req.body.organizationId, "organizationId");
    const cityId = asObjectIdOrNull(req.body.cityId, "cityId");
    const branchId = asObjectIdOrNull(req.body.branchId, "branchId");

    if (!name || !address) {
      return res.status(400).json({ message: "name and address are required." });
    }
    if (!["full", "partial", "empty"].includes(fuelStatus)) {
      return res.status(400).json({ message: "fuelStatus must be one of: full, partial, empty." });
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

    const station = await Station.create({
      name,
      address,
      contact,
      chapaSubaccountId: asText(req.body.chapaSubaccountId),
      fuelStatus,
      isActive: req.body.isActive !== undefined ? Boolean(req.body.isActive) : true,
      organizationId,
      cityId,
      branchId,
      location: {
        type: "Point",
        coordinates: [longitude, latitude]
      }
    });

    return res.status(201).json({
      message: "Station created successfully.",
      station: buildStationResponse(station)
    });
  } catch (err) {
    if (err instanceof Error && err.message.includes("must be a valid")) {
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
    if (req.body.chapaSubaccountId !== undefined) {
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
    if (req.body.cityId !== undefined) {
      station.cityId = asObjectIdOrNull(req.body.cityId, "cityId");
    }
    if (req.body.branchId !== undefined) {
      station.branchId = asObjectIdOrNull(req.body.branchId, "branchId");
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
    return res.json({
      message: "Station updated successfully.",
      station: buildStationResponse(station)
    });
  } catch (err) {
    if (err instanceof Error && err.message.includes("must be a valid")) {
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

    return res.json({
      message: station.isActive ? "Station activated." : "Station deactivated.",
      station: buildStationResponse(station)
    });
  } catch (_err) {
    return res.status(500).json({ message: "Failed to update station status." });
  }
};
