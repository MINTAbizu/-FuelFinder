const mongoose = require("mongoose");
const Region = require("../models/Region");
const City = require("../models/City");
const slugify = require("../utils/slugify");
const {
  asLocationText,
  normalizeRegionCategory,
  seedEthiopiaLocationDirectory
} = require("../utils/locationDirectory");

function asBool(value, defaultValue = true) {
  const text = asLocationText(value).toLowerCase();
  if (!text) return defaultValue;
  if (["true", "1", "yes"].includes(text)) return true;
  if (["false", "0", "no"].includes(text)) return false;
  return defaultValue;
}

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractId(value) {
  if (!value) return null;
  if (typeof value === "object" && value._id) return String(value._id);
  return String(value);
}

function buildRegionResponse(region) {
  return {
    id: String(region._id),
    name: region.name || "",
    slug: region.slug || "",
    code: region.code || "",
    category: region.category || "regional_state",
    countryCode: region.countryCode || "ET",
    isActive: Boolean(region.isActive),
    createdAt: region.createdAt,
    updatedAt: region.updatedAt
  };
}

function buildCityResponse(city) {
  const populatedRegion = city.regionId && typeof city.regionId === "object" && city.regionId.name
    ? buildRegionResponse(city.regionId)
    : null;

  return {
    id: String(city._id),
    name: city.name || "",
    slug: city.slug || "",
    code: city.code || "",
    isActive: Boolean(city.isActive),
    regionId: populatedRegion ? populatedRegion.id : extractId(city.regionId),
    region: populatedRegion,
    createdAt: city.createdAt,
    updatedAt: city.updatedAt
  };
}

exports.listRegions = async (req, res) => {
  try {
    const query = {};
    const q = asLocationText(req.query.q);

    if (req.query.isActive === "true") query.isActive = true;
    if (req.query.isActive === "false") query.isActive = false;
    if (q) {
      query.name = { $regex: escapeRegex(q), $options: "i" };
    }

    const regions = await Region.find(query).sort({ name: 1 }).lean();
    return res.json({
      total: regions.length,
      regions: regions.map((region) => buildRegionResponse(region))
    });
  } catch (_error) {
    return res.status(500).json({ message: "Failed to load regions." });
  }
};

exports.createRegion = async (req, res) => {
  try {
    const name = asLocationText(req.body.name);
    const code = asLocationText(req.body.code).toUpperCase();
    const category = normalizeRegionCategory(req.body.category);
    const isActive = req.body.isActive !== undefined ? Boolean(req.body.isActive) : true;

    if (!name) {
      return res.status(400).json({ message: "name is required." });
    }

    const slug = slugify(name);
    const payload = {
      name,
      slug,
      category,
      countryCode: "ET",
      isActive
    };
    if (code) payload.code = code;
    const region = await Region.create(payload);

    return res.status(201).json({
      message: "Region created successfully.",
      region: buildRegionResponse(region)
    });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ message: "A region with that name or code already exists." });
    }
    return res.status(500).json({ message: "Failed to create region." });
  }
};

exports.updateRegion = async (req, res) => {
  try {
    const regionId = asLocationText(req.params.regionId);
    if (!mongoose.isValidObjectId(regionId)) {
      return res.status(400).json({ message: "Invalid region id." });
    }

    const region = await Region.findById(regionId);
    if (!region) {
      return res.status(404).json({ message: "Region not found." });
    }

    if (req.body.name !== undefined) {
      const name = asLocationText(req.body.name);
      if (!name) return res.status(400).json({ message: "name cannot be empty." });
      region.name = name;
      region.slug = slugify(name);
    }
    if (req.body.code !== undefined) {
      region.code = asLocationText(req.body.code).toUpperCase() || undefined;
    }
    if (req.body.category !== undefined) {
      region.category = normalizeRegionCategory(req.body.category);
    }
    if (req.body.isActive !== undefined) {
      region.isActive = Boolean(req.body.isActive);
    }

    await region.save();
    return res.json({
      message: "Region updated successfully.",
      region: buildRegionResponse(region)
    });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ message: "A region with that name or code already exists." });
    }
    return res.status(500).json({ message: "Failed to update region." });
  }
};

exports.listCities = async (req, res) => {
  try {
    const query = {};
    const q = asLocationText(req.query.q);
    const regionId = asLocationText(req.query.regionId);

    if (req.query.isActive === "true") query.isActive = true;
    if (req.query.isActive === "false") query.isActive = false;
    if (regionId) {
      if (!mongoose.isValidObjectId(regionId)) {
        return res.status(400).json({ message: "regionId must be a valid ObjectId." });
      }
      query.regionId = regionId;
    }
    if (q) {
      query.name = { $regex: escapeRegex(q), $options: "i" };
    }

    const cities = await City.find(query)
      .populate("regionId", "name slug code category countryCode isActive createdAt updatedAt")
      .sort({ name: 1 })
      .lean();

    return res.json({
      total: cities.length,
      cities: cities.map((city) => buildCityResponse(city))
    });
  } catch (_error) {
    return res.status(500).json({ message: "Failed to load cities." });
  }
};

exports.createCity = async (req, res) => {
  try {
    const name = asLocationText(req.body.name);
    const code = asLocationText(req.body.code).toUpperCase();
    const regionId = asLocationText(req.body.regionId);
    const isActive = req.body.isActive !== undefined ? Boolean(req.body.isActive) : true;

    if (!name || !regionId) {
      return res.status(400).json({ message: "name and regionId are required." });
    }
    if (!mongoose.isValidObjectId(regionId)) {
      return res.status(400).json({ message: "regionId must be a valid ObjectId." });
    }

    const region = await Region.findById(regionId).lean();
    if (!region) {
      return res.status(404).json({ message: "Region not found." });
    }

    const payload = {
      name,
      slug: slugify(name),
      regionId,
      isActive
    };
    if (code) payload.code = code;
    const city = await City.create(payload);

    const populatedCity = await City.findById(city._id)
      .populate("regionId", "name slug code category countryCode isActive createdAt updatedAt")
      .lean();

    return res.status(201).json({
      message: "City created successfully.",
      city: buildCityResponse(populatedCity)
    });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ message: "A city with that name already exists in this region." });
    }
    return res.status(500).json({ message: "Failed to create city." });
  }
};

exports.updateCity = async (req, res) => {
  try {
    const cityId = asLocationText(req.params.cityId);
    if (!mongoose.isValidObjectId(cityId)) {
      return res.status(400).json({ message: "Invalid city id." });
    }

    const city = await City.findById(cityId);
    if (!city) {
      return res.status(404).json({ message: "City not found." });
    }

    if (req.body.name !== undefined) {
      const name = asLocationText(req.body.name);
      if (!name) return res.status(400).json({ message: "name cannot be empty." });
      city.name = name;
      city.slug = slugify(name);
    }
    if (req.body.code !== undefined) {
      city.code = asLocationText(req.body.code).toUpperCase() || undefined;
    }
    if (req.body.regionId !== undefined) {
      const regionId = asLocationText(req.body.regionId);
      if (!regionId) return res.status(400).json({ message: "regionId cannot be empty." });
      if (!mongoose.isValidObjectId(regionId)) {
        return res.status(400).json({ message: "regionId must be a valid ObjectId." });
      }
      const region = await Region.findById(regionId).lean();
      if (!region) {
        return res.status(404).json({ message: "Region not found." });
      }
      city.regionId = regionId;
    }
    if (req.body.isActive !== undefined) {
      city.isActive = Boolean(req.body.isActive);
    }

    await city.save();

    const populatedCity = await City.findById(city._id)
      .populate("regionId", "name slug code category countryCode isActive createdAt updatedAt")
      .lean();

    return res.json({
      message: "City updated successfully.",
      city: buildCityResponse(populatedCity)
    });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ message: "A city with that name already exists in this region." });
    }
    return res.status(500).json({ message: "Failed to update city." });
  }
};

exports.seedEthiopiaLocations = async (req, res) => {
  try {
    const overwrite = req.body?.overwrite !== undefined
      ? asBool(req.body.overwrite)
      : asBool(req.query.overwrite, false);

    const summary = await seedEthiopiaLocationDirectory({ overwrite });
    return res.json({
      message: "Ethiopia region and city directory seeded successfully.",
      summary
    });
  } catch (_error) {
    return res.status(500).json({ message: "Failed to seed Ethiopia locations." });
  }
};
