const mongoose = require("mongoose");
const Region = require("../models/Region");
const City = require("../models/City");
const ETHIOPIA_LOCATIONS = require("../data/ethiopiaLocations");
const slugify = require("./slugify");

const REGION_CATEGORIES = new Set(["regional_state", "chartered_city"]);

function asText(value) {
  return String(value || "").trim();
}

function asObjectIdOrNull(value, fieldName) {
  const text = typeof value === "object" && value?._id
    ? asText(value._id)
    : asText(value);
  if (!text) return null;
  if (!mongoose.isValidObjectId(text)) {
    throw new Error(`${fieldName} must be a valid ObjectId.`);
  }
  return text;
}

function normalizeRegionCategory(value) {
  const text = asText(value).toLowerCase();
  return REGION_CATEGORIES.has(text) ? text : "regional_state";
}

function normalizeLocationCategories(value) {
  const rawList = Array.isArray(value)
    ? value
    : (typeof value === "string" ? value.split(",") : []);

  return [...new Set(rawList.map((item) => asText(item).toLowerCase()).filter(Boolean))];
}

async function loadRegionById(regionId) {
  if (!regionId) return null;
  return Region.findById(regionId)
    .select("_id name slug code category countryCode isActive")
    .lean();
}

async function loadCityById(cityId) {
  if (!cityId) return null;
  return City.findById(cityId)
    .select("_id name slug code regionId isActive")
    .lean();
}

async function resolveStationLocation({ regionId, cityId }) {
  const normalizedRegionId = asObjectIdOrNull(regionId, "regionId");
  const normalizedCityId = asObjectIdOrNull(cityId, "cityId");

  if (!normalizedRegionId && !normalizedCityId) {
    return {
      regionId: null,
      cityId: null,
      region: null,
      city: null
    };
  }

  let region = await loadRegionById(normalizedRegionId);
  if (normalizedRegionId && !region) {
    throw new Error("regionId does not exist.");
  }

  let city = await loadCityById(normalizedCityId);
  if (normalizedCityId && !city) {
    throw new Error("cityId does not exist.");
  }

  if (city) {
    const cityRegionId = asText(city.regionId);
    if (region && cityRegionId !== asText(region._id)) {
      throw new Error("cityId does not belong to the provided regionId.");
    }
    if (!region) {
      region = await loadRegionById(city.regionId);
    }
  }

  return {
    regionId: region ? asText(region._id) : null,
    cityId: city ? asText(city._id) : null,
    region,
    city
  };
}

async function ensureRegionByName(name, options = {}) {
  const normalizedName = asText(name);
  if (!normalizedName) {
    throw new Error("Region name is required.");
  }

  const slug = slugify(normalizedName);
  if (!slug) {
    throw new Error("Region name must contain searchable characters.");
  }

  const code = asText(options.code).toUpperCase();
  const category = normalizeRegionCategory(options.category);
  const isActive = options.isActive !== undefined ? Boolean(options.isActive) : true;

  let region = await Region.findOne({ slug });
  if (!region) {
    region = await Region.create({
      name: normalizedName,
      slug,
      code,
      category,
      countryCode: "ET",
      isActive
    });
    return region;
  }

  let changed = false;
  if (region.name !== normalizedName) {
    region.name = normalizedName;
    changed = true;
  }
  if (code && region.code !== code) {
    region.code = code;
    changed = true;
  }
  if (region.category !== category) {
    region.category = category;
    changed = true;
  }
  if (region.countryCode !== "ET") {
    region.countryCode = "ET";
    changed = true;
  }
  if (region.isActive !== isActive) {
    region.isActive = isActive;
    changed = true;
  }
  if (changed) {
    await region.save();
  }

  return region;
}

async function ensureCityByName({ name, regionId, code = "", isActive = true }) {
  const normalizedName = asText(name);
  const normalizedRegionId = asObjectIdOrNull(regionId, "regionId");
  if (!normalizedName || !normalizedRegionId) {
    throw new Error("City name and regionId are required.");
  }

  const slug = slugify(normalizedName);
  if (!slug) {
    throw new Error("City name must contain searchable characters.");
  }

  const region = await Region.findById(normalizedRegionId);
  if (!region) {
    throw new Error("regionId does not exist.");
  }

  let city = await City.findOne({ regionId: normalizedRegionId, slug });
  if (!city) {
    city = await City.create({
      name: normalizedName,
      slug,
      code: asText(code).toUpperCase(),
      regionId: normalizedRegionId,
      isActive: Boolean(isActive)
    });
    return city;
  }

  let changed = false;
  const normalizedCode = asText(code).toUpperCase();
  if (city.name !== normalizedName) {
    city.name = normalizedName;
    changed = true;
  }
  if (normalizedCode && city.code !== normalizedCode) {
    city.code = normalizedCode;
    changed = true;
  }
  if (String(city.regionId) !== normalizedRegionId) {
    city.regionId = normalizedRegionId;
    changed = true;
  }
  if (city.isActive !== Boolean(isActive)) {
    city.isActive = Boolean(isActive);
    changed = true;
  }
  if (changed) {
    await city.save();
  }

  return city;
}

async function seedEthiopiaLocationDirectory(options = {}) {
  const overwrite = Boolean(options.overwrite);
  const summary = {
    regionsCreated: 0,
    regionsUpdated: 0,
    citiesCreated: 0,
    citiesUpdated: 0
  };

  for (const regionEntry of ETHIOPIA_LOCATIONS) {
    const slug = slugify(regionEntry.name);
    const nextRegion = {
      name: asText(regionEntry.name),
      slug,
      code: asText(regionEntry.code).toUpperCase(),
      category: normalizeRegionCategory(regionEntry.category),
      countryCode: "ET",
      isActive: true
    };

    let region = await Region.findOne({ slug });
    if (!region) {
      region = await Region.create(nextRegion);
      summary.regionsCreated += 1;
    } else {
      let regionChanged = false;
      if (region.name !== nextRegion.name) {
        region.name = nextRegion.name;
        regionChanged = true;
      }
      if ((overwrite || !region.code) && region.code !== nextRegion.code) {
        region.code = nextRegion.code;
        regionChanged = true;
      }
      if ((overwrite || !region.category) && region.category !== nextRegion.category) {
        region.category = nextRegion.category;
        regionChanged = true;
      }
      if (region.countryCode !== "ET") {
        region.countryCode = "ET";
        regionChanged = true;
      }
      if (region.isActive !== true) {
        region.isActive = true;
        regionChanged = true;
      }
      if (regionChanged) {
        await region.save();
        summary.regionsUpdated += 1;
      }
    }

    for (const cityName of regionEntry.cities || []) {
      const citySlug = slugify(cityName);
      const nextCity = {
        name: asText(cityName),
        slug: citySlug,
        regionId: region._id,
        isActive: true
      };

      let city = await City.findOne({ regionId: region._id, slug: citySlug });
      if (!city) {
        await City.create(nextCity);
        summary.citiesCreated += 1;
        continue;
      }

      let cityChanged = false;
      if (city.name !== nextCity.name) {
        city.name = nextCity.name;
        cityChanged = true;
      }
      if (String(city.regionId) !== String(region._id)) {
        city.regionId = region._id;
        cityChanged = true;
      }
      if (city.isActive !== true) {
        city.isActive = true;
        cityChanged = true;
      }
      if (cityChanged) {
        await city.save();
        summary.citiesUpdated += 1;
      }
    }
  }

  return summary;
}

module.exports = {
  asLocationText: asText,
  asLocationObjectIdOrNull: asObjectIdOrNull,
  normalizeLocationCategories,
  normalizeRegionCategory,
  resolveStationLocation,
  ensureRegionByName,
  ensureCityByName,
  seedEthiopiaLocationDirectory
};
