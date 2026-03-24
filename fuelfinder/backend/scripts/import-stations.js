require("dotenv").config();
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const connectDB = require("../src/config/db");
const Region = require("../src/models/Region");
const City = require("../src/models/City");
const Station = require("../src/models/Station");
const slugify = require("../src/utils/slugify");
const {
  asLocationText,
  ensureRegionByName,
  ensureCityByName,
  ensureWoredaByName,
  normalizeLocationCategories,
  resolveStationLocation
} = require("../src/utils/locationDirectory");

function parseArgs(argv) {
  const args = {};
  argv.forEach((item) => {
    const trimmed = String(item || "").trim();
    if (!trimmed.startsWith("--")) return;
    const [key, rawValue] = trimmed.slice(2).split("=");
    args[key] = rawValue === undefined ? "true" : rawValue;
  });
  return args;
}

function asNumber(value, fieldName) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    throw new Error(`${fieldName} must be a valid number.`);
  }
  return num;
}

function asBool(value, defaultValue = false) {
  const text = asLocationText(value).toLowerCase();
  if (!text) return defaultValue;
  if (["true", "1", "yes"].includes(text)) return true;
  if (["false", "0", "no"].includes(text)) return false;
  return defaultValue;
}

function asOptionalObjectId(value, fieldName) {
  const text = asLocationText(value);
  if (!text) return null;
  if (!mongoose.isValidObjectId(text)) {
    throw new Error(`${fieldName} must be a valid ObjectId.`);
  }
  return text;
}

function normalizeFuelStatus(value) {
  const status = asLocationText(value).toLowerCase() || "partial";
  if (!["full", "partial", "empty"].includes(status)) {
    throw new Error("fuelStatus must be one of: full, partial, empty.");
  }
  return status;
}

function loadRecords(filePath) {
  const absolutePath = path.isAbsolute(filePath)
    ? filePath
    : path.resolve(process.cwd(), filePath);
  const raw = fs.readFileSync(absolutePath, "utf8");
  const parsed = JSON.parse(raw);
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed?.stations)) return parsed.stations;
  throw new Error("Input JSON must be an array or an object with a stations array.");
}

const PLACE_NAME_ALIASES = new Map([
  ["አዲስ አበባ", "Addis Ababa"],
  ["addis abeba", "Addis Ababa"],
  ["asela", "Asella"],
  ["mile", "Mile"]
]);

function normalizeImportedPlaceName(value) {
  const text = asLocationText(value);
  if (!text) return "";

  const slashParts = text
    .split("/")
    .map((item) => asLocationText(item))
    .filter(Boolean);
  const latinPart = slashParts.find((item) => /[A-Za-z]/.test(item));
  const preferred = latinPart || text;
  const alias = PLACE_NAME_ALIASES.get(preferred.toLowerCase());
  return alias || preferred;
}

async function findRegionByLooseName(name) {
  const normalized = normalizeImportedPlaceName(name);
  const slug = slugify(normalized);
  if (!slug) return null;
  return Region.findOne({ slug }).lean();
}

async function findCityByLooseName(name, regionId = "") {
  const normalized = normalizeImportedPlaceName(name);
  const slug = slugify(normalized);
  if (!slug) return null;

  const query = { slug };
  if (regionId) query.regionId = regionId;

  const matches = await City.find(query)
    .populate("regionId", "name slug code category countryCode isActive")
    .sort({ name: 1 })
    .lean();

  if (matches.length === 1) return matches[0];
  return null;
}

async function resolveLocationFromRecord(record) {
  let regionId = asLocationText(record.regionId);
  let cityId = asLocationText(record.cityId);
  let woredaId = asLocationText(record.woredaId);
  const regionName = normalizeImportedPlaceName(record.regionName || record.region);
  const cityName = normalizeImportedPlaceName(record.cityName || record.city);
  const woredaName = normalizeImportedPlaceName(record.woredaName || record.woreda);

  if (!regionId) {
    if (regionName) {
      const category = asLocationText(record.regionCategory).toLowerCase() || "regional_state";
      const region = await ensureRegionByName(regionName, { category, code: record.regionCode });
      regionId = String(region._id);
    }
  }

  if (!cityId) {
    if (cityName) {
      if (!regionId) {
        const matchedCity = await findCityByLooseName(cityName);
        if (matchedCity) {
          cityId = String(matchedCity._id);
          regionId = String(matchedCity.regionId?._id || matchedCity.regionId || "");
        }
      }
      if (!regionId) {
        const matchedRegion = await findRegionByLooseName(cityName);
        if (matchedRegion) {
          regionId = String(matchedRegion._id);
        }
      }
      if (!regionId) {
        throw new Error("cityName requires regionName or regionId.");
      }
      if (!cityId) {
        const matchedCityInRegion = await findCityByLooseName(cityName, regionId);
        if (matchedCityInRegion) {
          cityId = String(matchedCityInRegion._id);
        } else {
          const city = await ensureCityByName({
            name: cityName,
            regionId,
            code: record.cityCode
          });
          cityId = String(city._id);
        }
      }
    }
  }

  if (!woredaId) {
    if (woredaName) {
      if (!regionId || !cityId) {
        throw new Error("woredaName requires regionId/regionName and cityId/cityName.");
      }
      const woreda = await ensureWoredaByName({
        name: woredaName,
        regionId,
        cityId,
        code: record.woredaCode,
        category: record.woredaCategory
      });
      woredaId = String(woreda._id);
    }
  }

  return resolveStationLocation({ regionId, cityId, woredaId });
}

function buildStationFilter(record, resolvedLocation) {
  const externalSource = asLocationText(record.externalSource);
  const externalSourceId = asLocationText(record.externalSourceId);
  if (externalSource && externalSourceId) {
    return { externalSource, externalSourceId };
  }

  return {
    name: asLocationText(record.name),
    address: asLocationText(record.address),
    woredaId: resolvedLocation.woredaId || null,
    cityId: resolvedLocation.cityId || null,
    regionId: resolvedLocation.regionId || null
  };
}

async function importStationRecord(record) {
  const name = asLocationText(record.name);
  const address = asLocationText(record.address);
  if (!name || !address) {
    throw new Error("name and address are required.");
  }

  const latitude = asNumber(record.latitude, "latitude");
  const longitude = asNumber(record.longitude, "longitude");
  if (latitude < -90 || latitude > 90) {
    throw new Error("latitude must be between -90 and 90.");
  }
  if (longitude < -180 || longitude > 180) {
    throw new Error("longitude must be between -180 and 180.");
  }

  const resolvedLocation = await resolveLocationFromRecord(record);
  const filter = buildStationFilter(record, resolvedLocation);
  const update = {
    name,
    address,
    contact: asLocationText(record.contact),
    organizationId: asOptionalObjectId(record.organizationId, "organizationId"),
    regionId: resolvedLocation.regionId,
    cityId: resolvedLocation.cityId,
    woredaId: resolvedLocation.woredaId,
    branchId: asOptionalObjectId(record.branchId, "branchId"),
    fuelStatus: normalizeFuelStatus(record.fuelStatus),
    isActive: record.isActive !== undefined ? Boolean(record.isActive) : true,
    subcity: normalizeImportedPlaceName(record.subcity),
    woreda: asLocationText(record.woreda || record.woredaName || resolvedLocation.woreda?.name),
    landmark: asLocationText(record.landmark),
    locationCategories: normalizeLocationCategories(record.locationCategories),
    location: {
      type: "Point",
      coordinates: [longitude, latitude]
    }
  };
  const externalSource = asLocationText(record.externalSource);
  const externalSourceId = asLocationText(record.externalSourceId);
  if (externalSource && externalSourceId) {
    update.externalSource = externalSource;
    update.externalSourceId = externalSourceId;
  }

  const station = await Station.findOneAndUpdate(
    filter,
    { $set: update, $setOnInsert: { fuelInventory: {} } },
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true
    }
  );

  return station;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const file = asLocationText(args.file);
  if (!file) {
    throw new Error("Provide --file=<path-to-json>.");
  }

  const records = loadRecords(file);
  await connectDB();

  const summary = {
    total: records.length,
    imported: 0,
    failed: 0,
    errors: []
  };

  for (let index = 0; index < records.length; index += 1) {
    try {
      await importStationRecord(records[index] || {});
      summary.imported += 1;
    } catch (error) {
      summary.failed += 1;
      if (summary.errors.length < 10) {
        summary.errors.push(`Row ${index + 1}: ${error.message}`);
      }
    }
  }

  console.log("Station import complete.");
  console.log(JSON.stringify(summary, null, 2));

  if (summary.failed && asBool(args.failOnError, false)) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error("Station import failed:", error.message);
    process.exitCode = 1;
  })
  .finally(() => {
    mongoose.connection.close();
  });
