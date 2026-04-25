/* eslint-disable no-console */
require("dotenv").config();

const mongoose = require("mongoose");
const connectDB = require("../src/config/db");
const Region = require("../src/models/Region");
const City = require("../src/models/City");
const Woreda = require("../src/models/Woreda");
const Station = require("../src/models/Station");
const User = require("../src/models/User");
const slugify = require("../src/utils/slugify");
const {
  asLocationText,
  ensureCityByName,
  ensureRegionByName,
  ensureWoredaByName,
  normalizeCityName,
  normalizeRegionName
} = require("../src/utils/locationDirectory");

function getArg(name, fallback = "") {
  const prefix = `--${name}=`;
  const arg = process.argv.find((item) => String(item || "").startsWith(prefix));
  return arg ? String(arg).slice(prefix.length).trim() : fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

async function main() {
  const rawCityName = getArg("city", "Asela");
  const rawRegionName = getArg("region", "Oromia");
  const apply = hasFlag("apply");

  const cityName = normalizeCityName(rawCityName);
  const regionName = normalizeRegionName(rawRegionName);
  const citySlug = slugify(cityName);

  if (!citySlug || !regionName) {
    throw new Error("city and region are required.");
  }

  await connectDB();

  const canonicalRegion = await ensureRegionByName(regionName, {
    code: regionName === "Oromia" ? "OR" : undefined
  });
  const canonicalCity = await ensureCityByName({
    name: cityName,
    regionId: canonicalRegion._id
  });

  const allMatchingCities = await City.find({ slug: citySlug })
    .populate("regionId", "name slug code")
    .sort({ createdAt: 1, name: 1 })
    .lean();

  const duplicateCities = allMatchingCities.filter((city) => {
    const region = city?.regionId;
    const normalizedRegion = normalizeRegionName(region?.name);
    return (
      String(city._id) !== String(canonicalCity._id) &&
      (!normalizedRegion || normalizedRegion === canonicalRegion.name)
    );
  });

  const summary = {
    canonicalRegionId: String(canonicalRegion._id),
    canonicalCityId: String(canonicalCity._id),
    duplicateCitiesFound: duplicateCities.length,
    stationsRepointed: 0,
    woredaRefsRepointed: 0,
    userCityRefsAdded: 0,
    userCityRefsRemoved: 0,
    duplicateCitiesDeleted: 0,
    duplicateWoredasDeleted: 0
  };

  for (const duplicateCity of duplicateCities) {
    const duplicateCityId = duplicateCity._id;
    const duplicateWoredas = await Woreda.find({ cityId: duplicateCityId }).lean();

    for (const duplicateWoreda of duplicateWoredas) {
      const canonicalWoreda = await ensureWoredaByName({
        name: duplicateWoreda.name,
        regionId: canonicalRegion._id,
        cityId: canonicalCity._id,
        code: duplicateWoreda.code,
        category: duplicateWoreda.category,
        isActive: duplicateWoreda.isActive
      });

      const stationCount = await Station.countDocuments({ woredaId: duplicateWoreda._id });
      summary.woredaRefsRepointed += stationCount;

      if (apply) {
        await Station.updateMany(
          { woredaId: duplicateWoreda._id },
          {
            $set: {
              woredaId: canonicalWoreda._id,
              cityId: canonicalCity._id,
              regionId: canonicalRegion._id
            }
          }
        );

        const remainingStationRefs = await Station.countDocuments({ woredaId: duplicateWoreda._id });
        if (!remainingStationRefs) {
          await Woreda.deleteOne({ _id: duplicateWoreda._id });
          summary.duplicateWoredasDeleted += 1;
        }
      }
    }

    const stationCount = await Station.countDocuments({ cityId: duplicateCityId });
    summary.stationsRepointed += stationCount;

    const usersWithDuplicateCity = await User.countDocuments({ cityIds: duplicateCityId });
    summary.userCityRefsAdded += usersWithDuplicateCity;
    summary.userCityRefsRemoved += usersWithDuplicateCity;

    if (apply) {
      await Station.updateMany(
        { cityId: duplicateCityId },
        {
          $set: {
            cityId: canonicalCity._id,
            regionId: canonicalRegion._id
          }
        }
      );

      await User.updateMany(
        { cityIds: duplicateCityId },
        { $addToSet: { cityIds: canonicalCity._id } }
      );
      await User.updateMany(
        { cityIds: duplicateCityId },
        { $pull: { cityIds: duplicateCityId } }
      );

      const [remainingStations, remainingWoredas, remainingUsers] = await Promise.all([
        Station.countDocuments({ cityId: duplicateCityId }),
        Woreda.countDocuments({ cityId: duplicateCityId }),
        User.countDocuments({ cityIds: duplicateCityId })
      ]);

      if (!remainingStations && !remainingWoredas && !remainingUsers) {
        await City.deleteOne({ _id: duplicateCityId });
        summary.duplicateCitiesDeleted += 1;
      }
    }
  }

  if (apply) {
    await Station.updateMany(
      { cityId: canonicalCity._id },
      { $set: { regionId: canonicalRegion._id } }
    );
  }

  const duplicateRegions = await Region.find({})
    .sort({ createdAt: 1, name: 1 })
    .lean();

  for (const duplicateRegion of duplicateRegions) {
    if (String(duplicateRegion._id) === String(canonicalRegion._id)) continue;
    if (normalizeRegionName(duplicateRegion.name) !== canonicalRegion.name) continue;

    if (apply) {
      await Station.updateMany(
        { regionId: duplicateRegion._id, cityId: canonicalCity._id },
        { $set: { regionId: canonicalRegion._id } }
      );
    }
  }

  console.log(`Directory repair scan complete for ${cityName}, ${regionName}.`);
  console.log(JSON.stringify(summary, null, 2));
  if (!apply) {
    console.log("Dry run only. Re-run with --apply to persist the repair.");
  }

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("Directory repair failed:", error?.message || error);
  try {
    await mongoose.disconnect();
  } catch (_error) {
    // no-op
  }
  process.exit(1);
});
