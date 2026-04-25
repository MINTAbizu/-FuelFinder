/* eslint-disable no-console */
require("dotenv").config();

const mongoose = require("mongoose");
const connectDB = require("../src/config/db");
const City = require("../src/models/City");
const Region = require("../src/models/Region");
const Station = require("../src/models/Station");
const { asLocationText, normalizeCityName, normalizeRegionName } = require("../src/utils/locationDirectory");
const slugify = require("../src/utils/slugify");

function getArg(name, fallback = "") {
  const prefix = `--${name}=`;
  const arg = process.argv.find((item) => String(item || "").startsWith(prefix));
  return arg ? String(arg).slice(prefix.length).trim() : fallback;
}

async function main() {
  const cityName = normalizeCityName(getArg("city", "Asela"));
  const regionName = normalizeRegionName(getArg("region", "Oromia"));
  const citySlug = slugify(cityName);
  const regionSlug = slugify(regionName);

  if (!citySlug) {
    throw new Error("city is required.");
  }

  await connectDB();

  const region = regionSlug
    ? await Region.findOne({ slug: regionSlug }).lean()
    : null;

  const cityQuery = { slug: citySlug };
  if (region?._id) {
    cityQuery.regionId = region._id;
  }

  const city = await City.findOne(cityQuery).lean();
  if (!city) {
    console.log(JSON.stringify({
      cityName,
      regionName,
      found: false,
      stationCount: 0,
      stations: []
    }, null, 2));
    await mongoose.disconnect();
    return;
  }

  const stations = await Station.find({
    cityId: city._id,
    isActive: true
  })
    .select("name address subcity landmark externalSource externalSourceId location")
    .sort({ name: 1 })
    .lean();

  console.log(JSON.stringify({
    cityName: city.name,
    regionName: asLocationText(region?.name),
    found: true,
    cityId: String(city._id),
    stationCount: stations.length,
    stations: stations.map((station) => ({
      name: station.name,
      address: station.address,
      subcity: station.subcity || "",
      landmark: station.landmark || "",
      externalSource: station.externalSource || "",
      externalSourceId: station.externalSourceId || "",
      coordinates: Array.isArray(station?.location?.coordinates)
        ? station.location.coordinates
        : []
    }))
  }, null, 2));

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("City station verification failed:", error?.message || error);
  try {
    await mongoose.disconnect();
  } catch (_error) {
    // no-op
  }
  process.exit(1);
});
