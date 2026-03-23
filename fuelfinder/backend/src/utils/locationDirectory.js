const mongoose = require("mongoose");
const Region = require("../models/Region");
const City = require("../models/City");
const Woreda = require("../models/Woreda");
const ETHIOPIA_LOCATIONS = require("../data/ethiopiaLocations");
const slugify = require("./slugify");

const REGION_CATEGORIES = new Set(["regional_state", "chartered_city"]);
const WOREDA_CATEGORIES = new Set(["woreda", "subcity", "district", "special_district", "other"]);

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

function normalizeWoredaCategory(value) {
  const text = asText(value).toLowerCase();
  return WOREDA_CATEGORIES.has(text) ? text : "woreda";
}

function normalizeLocationCategories(value) {
  const rawList = Array.isArray(value)
    ? value
    : (typeof value === "string" ? value.split(",") : []);

  return [...new Set(rawList.map((item) => asText(item).toLowerCase()).filter(Boolean))];
}

function normalizeCitySeedEntry(value) {
  if (typeof value === "string") {
    return {
      name: asText(value),
      code: "",
      isActive: true,
      woredas: []
    };
  }

  return {
    name: asText(value?.name),
    code: asText(value?.code).toUpperCase(),
    isActive: value?.isActive !== undefined ? Boolean(value.isActive) : true,
    woredas: Array.isArray(value?.woredas) ? value.woredas : []
  };
}

function normalizeWoredaSeedEntry(value) {
  if (typeof value === "string") {
    return {
      name: asText(value),
      code: "",
      category: "woreda",
      isActive: true
    };
  }

  return {
    name: asText(value?.name),
    code: asText(value?.code).toUpperCase(),
    category: normalizeWoredaCategory(value?.category),
    isActive: value?.isActive !== undefined ? Boolean(value.isActive) : true
  };
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

async function loadWoredaById(woredaId) {
  if (!woredaId) return null;
  return Woreda.findById(woredaId)
    .select("_id name slug code category regionId cityId isActive")
    .lean();
}

async function resolveStationLocation({ regionId, cityId, woredaId }) {
  const normalizedRegionId = asObjectIdOrNull(regionId, "regionId");
  const normalizedCityId = asObjectIdOrNull(cityId, "cityId");
  const normalizedWoredaId = asObjectIdOrNull(woredaId, "woredaId");

  if (!normalizedRegionId && !normalizedCityId && !normalizedWoredaId) {
    return {
      regionId: null,
      cityId: null,
      woredaId: null,
      region: null,
      city: null,
      woreda: null
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

  let woreda = await loadWoredaById(normalizedWoredaId);
  if (normalizedWoredaId && !woreda) {
    throw new Error("woredaId does not exist.");
  }

  if (woreda) {
    const woredaCityId = asText(woreda.cityId);
    const woredaRegionId = asText(woreda.regionId);

    if (city && woredaCityId !== asText(city._id)) {
      throw new Error("woredaId does not belong to the provided cityId.");
    }
    if (region && woredaRegionId !== asText(region._id)) {
      throw new Error("woredaId does not belong to the provided regionId.");
    }
    if (!city) {
      city = await loadCityById(woreda.cityId);
    }
    if (!region) {
      region = await loadRegionById(woreda.regionId);
    }
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
    woredaId: woreda ? asText(woreda._id) : null,
    region,
    city,
    woreda
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

  const hasCode = Object.prototype.hasOwnProperty.call(options, "code");
  const code = asText(options.code).toUpperCase();
  const category = normalizeRegionCategory(options.category);
  const isActive = options.isActive !== undefined ? Boolean(options.isActive) : true;

  let region = await Region.findOne({ slug });
  if (!region) {
    const payload = {
      name: normalizedName,
      slug,
      category,
      countryCode: "ET",
      isActive
    };
    if (hasCode && code) payload.code = code;
    region = await Region.create(payload);
    return region;
  }

  let changed = false;
  if (region.name !== normalizedName) {
    region.name = normalizedName;
    changed = true;
  }
  if (hasCode && region.code !== (code || undefined)) {
    region.code = code || undefined;
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

async function ensureCityByName(input = {}) {
  const {
    name,
    regionId,
    code,
    isActive = true
  } = input;
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

  const hasCode = Object.prototype.hasOwnProperty.call(input, "code");
  let city = await City.findOne({ regionId: normalizedRegionId, slug });

  if (!city) {
    const payload = {
      name: normalizedName,
      slug,
      regionId: normalizedRegionId,
      isActive: Boolean(isActive)
    };
    const normalizedCode = asText(code).toUpperCase();
    if (hasCode && normalizedCode) payload.code = normalizedCode;
    city = await City.create(payload);
    return city;
  }

  let changed = false;
  const normalizedCode = asText(code).toUpperCase();
  if (city.name !== normalizedName) {
    city.name = normalizedName;
    changed = true;
  }
  if (hasCode && city.code !== (normalizedCode || undefined)) {
    city.code = normalizedCode || undefined;
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

async function ensureWoredaByName(input = {}) {
  const {
    name,
    regionId,
    cityId,
    code,
    category,
    isActive = true
  } = input;

  const normalizedName = asText(name);
  const normalizedRegionId = asObjectIdOrNull(regionId, "regionId");
  const normalizedCityId = asObjectIdOrNull(cityId, "cityId");
  if (!normalizedName || !normalizedRegionId || !normalizedCityId) {
    throw new Error("Woreda name, regionId, and cityId are required.");
  }

  const slug = slugify(normalizedName);
  if (!slug) {
    throw new Error("Woreda name must contain searchable characters.");
  }

  const city = await City.findById(normalizedCityId);
  if (!city) {
    throw new Error("cityId does not exist.");
  }
  if (String(city.regionId) !== normalizedRegionId) {
    throw new Error("cityId does not belong to the provided regionId.");
  }

  const hasCode = Object.prototype.hasOwnProperty.call(input, "code");
  const normalizedCode = asText(code).toUpperCase();
  const normalizedCategory = normalizeWoredaCategory(category);

  let woreda = await Woreda.findOne({ cityId: normalizedCityId, slug });
  if (!woreda) {
    const payload = {
      name: normalizedName,
      slug,
      category: normalizedCategory,
      regionId: normalizedRegionId,
      cityId: normalizedCityId,
      isActive: Boolean(isActive)
    };
    if (hasCode && normalizedCode) payload.code = normalizedCode;
    woreda = await Woreda.create(payload);
    return woreda;
  }

  let changed = false;
  if (woreda.name !== normalizedName) {
    woreda.name = normalizedName;
    changed = true;
  }
  if (hasCode && woreda.code !== (normalizedCode || undefined)) {
    woreda.code = normalizedCode || undefined;
    changed = true;
  }
  if (woreda.category !== normalizedCategory) {
    woreda.category = normalizedCategory;
    changed = true;
  }
  if (String(woreda.regionId) !== normalizedRegionId) {
    woreda.regionId = normalizedRegionId;
    changed = true;
  }
  if (String(woreda.cityId) !== normalizedCityId) {
    woreda.cityId = normalizedCityId;
    changed = true;
  }
  if (woreda.isActive !== Boolean(isActive)) {
    woreda.isActive = Boolean(isActive);
    changed = true;
  }
  if (changed) {
    await woreda.save();
  }

  return woreda;
}

async function seedEthiopiaLocationDirectory(options = {}) {
  const overwrite = Boolean(options.overwrite);
  const summary = {
    regionsCreated: 0,
    regionsUpdated: 0,
    citiesCreated: 0,
    citiesUpdated: 0,
    woredasCreated: 0,
    woredasUpdated: 0
  };

  for (const regionEntry of ETHIOPIA_LOCATIONS) {
    const slug = slugify(regionEntry.name);
    const nextRegion = {
      name: asText(regionEntry.name),
      slug,
      code: asText(regionEntry.code).toUpperCase(),
      category: normalizeRegionCategory(regionEntry.category),
      countryCode: "ET",
      isActive: regionEntry.isActive !== undefined ? Boolean(regionEntry.isActive) : true
    };

    let region = await Region.findOne({ slug });
    if (!region) {
      const regionPayload = {
        name: nextRegion.name,
        slug: nextRegion.slug,
        category: nextRegion.category,
        countryCode: "ET",
        isActive: nextRegion.isActive
      };
      if (nextRegion.code) regionPayload.code = nextRegion.code;
      region = await Region.create(regionPayload);
      summary.regionsCreated += 1;
    } else {
      let regionChanged = false;
      if (region.name !== nextRegion.name) {
        region.name = nextRegion.name;
        regionChanged = true;
      }
      if ((overwrite || !region.code) && region.code !== (nextRegion.code || undefined)) {
        region.code = nextRegion.code || undefined;
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
      if (region.isActive !== nextRegion.isActive) {
        region.isActive = nextRegion.isActive;
        regionChanged = true;
      }
      if (regionChanged) {
        await region.save();
        summary.regionsUpdated += 1;
      }
    }

    for (const rawCityEntry of regionEntry.cities || []) {
      const cityEntry = normalizeCitySeedEntry(rawCityEntry);
      if (!cityEntry.name) continue;
      const citySlug = slugify(cityEntry.name);
      const nextCity = {
        name: cityEntry.name,
        slug: citySlug,
        code: cityEntry.code,
        regionId: region._id,
        isActive: cityEntry.isActive
      };

      let city = await City.findOne({ regionId: region._id, slug: citySlug });
      if (!city) {
        const cityPayload = {
          name: nextCity.name,
          slug: nextCity.slug,
          regionId: region._id,
          isActive: nextCity.isActive
        };
        if (nextCity.code) cityPayload.code = nextCity.code;
        city = await City.create(cityPayload);
        summary.citiesCreated += 1;
      } else {
        let cityChanged = false;
        if (city.name !== nextCity.name) {
          city.name = nextCity.name;
          cityChanged = true;
        }
        if ((overwrite || !city.code) && city.code !== (nextCity.code || undefined)) {
          city.code = nextCity.code || undefined;
          cityChanged = true;
        }
        if (String(city.regionId) !== String(region._id)) {
          city.regionId = region._id;
          cityChanged = true;
        }
        if (city.isActive !== nextCity.isActive) {
          city.isActive = nextCity.isActive;
          cityChanged = true;
        }
        if (cityChanged) {
          await city.save();
          summary.citiesUpdated += 1;
        }
      }

      for (const rawWoredaEntry of cityEntry.woredas || []) {
        const woredaEntry = normalizeWoredaSeedEntry(rawWoredaEntry);
        if (!woredaEntry.name) continue;
        const woredaSlug = slugify(woredaEntry.name);
        const nextWoreda = {
          name: woredaEntry.name,
          slug: woredaSlug,
          code: woredaEntry.code,
          category: woredaEntry.category,
          regionId: region._id,
          cityId: city._id,
          isActive: woredaEntry.isActive
        };

        let woreda = await Woreda.findOne({ cityId: city._id, slug: woredaSlug });
        if (!woreda) {
          const woredaPayload = {
            name: nextWoreda.name,
            slug: nextWoreda.slug,
            category: nextWoreda.category,
            regionId: region._id,
            cityId: city._id,
            isActive: nextWoreda.isActive
          };
          if (nextWoreda.code) woredaPayload.code = nextWoreda.code;
          await Woreda.create(woredaPayload);
          summary.woredasCreated += 1;
          continue;
        }

        let woredaChanged = false;
        if (woreda.name !== nextWoreda.name) {
          woreda.name = nextWoreda.name;
          woredaChanged = true;
        }
        if ((overwrite || !woreda.code) && woreda.code !== (nextWoreda.code || undefined)) {
          woreda.code = nextWoreda.code || undefined;
          woredaChanged = true;
        }
        if ((overwrite || !woreda.category) && woreda.category !== nextWoreda.category) {
          woreda.category = nextWoreda.category;
          woredaChanged = true;
        }
        if (String(woreda.regionId) !== String(region._id)) {
          woreda.regionId = region._id;
          woredaChanged = true;
        }
        if (String(woreda.cityId) !== String(city._id)) {
          woreda.cityId = city._id;
          woredaChanged = true;
        }
        if (woreda.isActive !== nextWoreda.isActive) {
          woreda.isActive = nextWoreda.isActive;
          woredaChanged = true;
        }
        if (woredaChanged) {
          await woreda.save();
          summary.woredasUpdated += 1;
        }
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
  normalizeWoredaCategory,
  resolveStationLocation,
  ensureRegionByName,
  ensureCityByName,
  ensureWoredaByName,
  seedEthiopiaLocationDirectory
};
