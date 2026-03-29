const mongoose = require("mongoose");
const Region = require("../models/Region");
const City = require("../models/City");
const Station = require("../models/Station");
const Woreda = require("../models/Woreda");
const slugify = require("../utils/slugify");
const {
  asLocationText,
  normalizeRegionCategory,
  normalizeWoredaCategory,
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

function buildCityResponse(city, stats = null) {
  const populatedRegion = city.regionId && typeof city.regionId === "object" && city.regionId.name
    ? buildRegionResponse(city.regionId)
    : null;
  const latitude = Number(stats?.latitude);
  const longitude = Number(stats?.longitude);

  return {
    id: String(city._id),
    name: city.name || "",
    slug: city.slug || "",
    code: city.code || "",
    isActive: Boolean(city.isActive),
    regionId: populatedRegion ? populatedRegion.id : extractId(city.regionId),
    region: populatedRegion,
    stationCount: Number(stats?.stationCount || 0),
    latitude: Number.isFinite(latitude) ? latitude : null,
    longitude: Number.isFinite(longitude) ? longitude : null,
    createdAt: city.createdAt,
    updatedAt: city.updatedAt
  };
}

function buildWoredaResponse(woreda) {
  const populatedRegion = woreda.regionId && typeof woreda.regionId === "object" && woreda.regionId.name
    ? buildRegionResponse(woreda.regionId)
    : null;
  const populatedCity = woreda.cityId && typeof woreda.cityId === "object" && woreda.cityId.name
    ? buildCityResponse(woreda.cityId)
    : null;

  return {
    id: String(woreda._id),
    name: woreda.name || "",
    slug: woreda.slug || "",
    code: woreda.code || "",
    category: woreda.category || "woreda",
    isActive: Boolean(woreda.isActive),
    regionId: populatedRegion ? populatedRegion.id : extractId(woreda.regionId),
    region: populatedRegion,
    cityId: populatedCity ? populatedCity.id : extractId(woreda.cityId),
    city: populatedCity,
    createdAt: woreda.createdAt,
    updatedAt: woreda.updatedAt
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

    const cityIds = cities.map((city) => city._id);
    const stats = cityIds.length
      ? await Station.aggregate([
          {
            $match: {
              cityId: { $in: cityIds },
              isActive: true
            }
          },
          {
            $group: {
              _id: "$cityId",
              stationCount: { $sum: 1 },
              longitude: { $avg: { $arrayElemAt: ["$location.coordinates", 0] } },
              latitude: { $avg: { $arrayElemAt: ["$location.coordinates", 1] } }
            }
          }
        ])
      : [];
    const statsByCityId = new Map(stats.map((item) => [String(item._id), item]));

    return res.json({
      total: cities.length,
      cities: cities.map((city) => buildCityResponse(city, statsByCityId.get(String(city._id))))
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

exports.listWoredas = async (req, res) => {
  try {
    const query = {};
    const q = asLocationText(req.query.q);
    const regionId = asLocationText(req.query.regionId);
    const cityId = asLocationText(req.query.cityId);

    if (req.query.isActive === "true") query.isActive = true;
    if (req.query.isActive === "false") query.isActive = false;
    if (regionId) {
      if (!mongoose.isValidObjectId(regionId)) {
        return res.status(400).json({ message: "regionId must be a valid ObjectId." });
      }
      query.regionId = regionId;
    }
    if (cityId) {
      if (!mongoose.isValidObjectId(cityId)) {
        return res.status(400).json({ message: "cityId must be a valid ObjectId." });
      }
      query.cityId = cityId;
    }
    if (q) {
      query.name = { $regex: escapeRegex(q), $options: "i" };
    }

    const woredas = await Woreda.find(query)
      .populate("regionId", "name slug code category countryCode isActive createdAt updatedAt")
      .populate("cityId", "name slug code regionId isActive createdAt updatedAt")
      .sort({ name: 1 })
      .lean();

    return res.json({
      total: woredas.length,
      woredas: woredas.map((woreda) => buildWoredaResponse(woreda))
    });
  } catch (_error) {
    return res.status(500).json({ message: "Failed to load woredas." });
  }
};

exports.createWoreda = async (req, res) => {
  try {
    const name = asLocationText(req.body.name);
    const code = asLocationText(req.body.code).toUpperCase();
    const category = normalizeWoredaCategory(req.body.category);
    const regionId = asLocationText(req.body.regionId);
    const cityId = asLocationText(req.body.cityId);
    const isActive = req.body.isActive !== undefined ? Boolean(req.body.isActive) : true;

    if (!name || !regionId || !cityId) {
      return res.status(400).json({ message: "name, regionId, and cityId are required." });
    }
    if (!mongoose.isValidObjectId(regionId)) {
      return res.status(400).json({ message: "regionId must be a valid ObjectId." });
    }
    if (!mongoose.isValidObjectId(cityId)) {
      return res.status(400).json({ message: "cityId must be a valid ObjectId." });
    }

    const city = await City.findById(cityId).lean();
    if (!city) {
      return res.status(404).json({ message: "City not found." });
    }
    if (String(city.regionId) !== regionId) {
      return res.status(400).json({ message: "cityId does not belong to the provided regionId." });
    }

    const payload = {
      name,
      slug: slugify(name),
      category,
      regionId,
      cityId,
      isActive
    };
    if (code) payload.code = code;
    const woreda = await Woreda.create(payload);

    const populatedWoreda = await Woreda.findById(woreda._id)
      .populate("regionId", "name slug code category countryCode isActive createdAt updatedAt")
      .populate("cityId", "name slug code regionId isActive createdAt updatedAt")
      .lean();

    return res.status(201).json({
      message: "Woreda created successfully.",
      woreda: buildWoredaResponse(populatedWoreda)
    });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ message: "A woreda with that name already exists in this city." });
    }
    return res.status(500).json({ message: "Failed to create woreda." });
  }
};

exports.updateWoreda = async (req, res) => {
  try {
    const woredaId = asLocationText(req.params.woredaId);
    if (!mongoose.isValidObjectId(woredaId)) {
      return res.status(400).json({ message: "Invalid woreda id." });
    }

    const woreda = await Woreda.findById(woredaId);
    if (!woreda) {
      return res.status(404).json({ message: "Woreda not found." });
    }

    if (req.body.name !== undefined) {
      const name = asLocationText(req.body.name);
      if (!name) return res.status(400).json({ message: "name cannot be empty." });
      woreda.name = name;
      woreda.slug = slugify(name);
    }
    if (req.body.code !== undefined) {
      woreda.code = asLocationText(req.body.code).toUpperCase() || undefined;
    }
    if (req.body.category !== undefined) {
      woreda.category = normalizeWoredaCategory(req.body.category);
    }

    let nextRegionId = asLocationText(woreda.regionId);
    let nextCityId = asLocationText(woreda.cityId);

    if (req.body.regionId !== undefined) {
      nextRegionId = asLocationText(req.body.regionId);
      if (!nextRegionId) return res.status(400).json({ message: "regionId cannot be empty." });
      if (!mongoose.isValidObjectId(nextRegionId)) {
        return res.status(400).json({ message: "regionId must be a valid ObjectId." });
      }
    }
    if (req.body.cityId !== undefined) {
      nextCityId = asLocationText(req.body.cityId);
      if (!nextCityId) return res.status(400).json({ message: "cityId cannot be empty." });
      if (!mongoose.isValidObjectId(nextCityId)) {
        return res.status(400).json({ message: "cityId must be a valid ObjectId." });
      }
    }

    if (req.body.regionId !== undefined || req.body.cityId !== undefined) {
      const city = await City.findById(nextCityId).lean();
      if (!city) {
        return res.status(404).json({ message: "City not found." });
      }
      if (String(city.regionId) !== nextRegionId) {
        return res.status(400).json({ message: "cityId does not belong to the provided regionId." });
      }
      woreda.regionId = nextRegionId;
      woreda.cityId = nextCityId;
    }

    if (req.body.isActive !== undefined) {
      woreda.isActive = Boolean(req.body.isActive);
    }

    await woreda.save();

    const populatedWoreda = await Woreda.findById(woreda._id)
      .populate("regionId", "name slug code category countryCode isActive createdAt updatedAt")
      .populate("cityId", "name slug code regionId isActive createdAt updatedAt")
      .lean();

    return res.json({
      message: "Woreda updated successfully.",
      woreda: buildWoredaResponse(populatedWoreda)
    });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ message: "A woreda with that name already exists in this city." });
    }
    return res.status(500).json({ message: "Failed to update woreda." });
  }
};

exports.seedEthiopiaLocations = async (req, res) => {
  try {
    const overwrite = req.body?.overwrite !== undefined
      ? asBool(req.body.overwrite)
      : asBool(req.query.overwrite, false);

    const summary = await seedEthiopiaLocationDirectory({ overwrite });
    return res.json({
      message: "Ethiopia region, city, and woreda directory seeded successfully.",
      summary
    });
  } catch (_error) {
    return res.status(500).json({ message: "Failed to seed Ethiopia locations." });
  }
};
