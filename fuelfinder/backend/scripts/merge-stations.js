/* eslint-disable no-console */
require("dotenv").config();
const mongoose = require("mongoose");

const connectDB = require("../src/config/db");
const Station = require("../src/models/Station");
const QueueTicket = require("../src/models/QueueTicket");
const Report = require("../src/models/Report");
const User = require("../src/models/User");

function getArg(name, fallback = "") {
  const prefix = `--${name}=`;
  const arg = process.argv.find((item) => item.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function normalizeName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function likelySameName(a, b) {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  return na.includes(nb) || nb.includes(na);
}

function toRadians(value) {
  return (Number(value) * Math.PI) / 180;
}

function distanceMeters(aLat, aLon, bLat, bLon) {
  const earthRadius = 6371000;
  const dLat = toRadians(bLat - aLat);
  const dLon = toRadians(bLon - aLon);
  const lat1 = toRadians(aLat);
  const lat2 = toRadians(bLat);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return earthRadius * (2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x)));
}

function getLatLon(station) {
  const coords = Array.isArray(station?.location?.coordinates)
    ? station.location.coordinates
    : [];
  if (coords.length < 2) return null;
  const lon = Number(coords[0]);
  const lat = Number(coords[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon };
}

function stationScore(station) {
  let score = 0;
  if (station?.organizationId) score += 5;
  if (station?.cityId) score += 3;
  if (station?.branchId) score += 3;
  if (!station?.externalSource) score += 2;
  if (station?.isActive) score += 1;
  return score;
}

function chooseCanonical(stations) {
  const sorted = [...stations].sort((a, b) => {
    const scoreDiff = stationScore(b) - stationScore(a);
    if (scoreDiff !== 0) return scoreDiff;
    const aTime = new Date(a.createdAt || 0).getTime();
    const bTime = new Date(b.createdAt || 0).getTime();
    return aTime - bTime;
  });
  return sorted[0];
}

function buildMergePairs(stations, maxDistanceMeters) {
  const pairs = [];
  const consumed = new Set();

  for (let i = 0; i < stations.length; i += 1) {
    const base = stations[i];
    if (consumed.has(String(base._id))) continue;
    const basePos = getLatLon(base);
    if (!basePos) continue;

    const cluster = [base];
    for (let j = i + 1; j < stations.length; j += 1) {
      const candidate = stations[j];
      if (consumed.has(String(candidate._id))) continue;
      if (!likelySameName(base.name, candidate.name)) continue;
      const cPos = getLatLon(candidate);
      if (!cPos) continue;
      const d = distanceMeters(basePos.lat, basePos.lon, cPos.lat, cPos.lon);
      if (d <= maxDistanceMeters) {
        cluster.push(candidate);
      }
    }

    if (cluster.length <= 1) continue;
    const canonical = chooseCanonical(cluster);
    const canonicalId = String(canonical._id);
    cluster.forEach((item) => consumed.add(String(item._id)));

    cluster
      .filter((item) => String(item._id) !== canonicalId)
      .forEach((duplicate) => {
        pairs.push({
          duplicate,
          canonical
        });
      });
  }

  return pairs;
}

async function applyMergePair(duplicate, canonical) {
  const duplicateId = new mongoose.Types.ObjectId(String(duplicate._id));
  const canonicalId = new mongoose.Types.ObjectId(String(canonical._id));

  const canonicalDoc = await Station.findById(canonicalId);
  if (!canonicalDoc) return { skipped: true };

  if (!canonicalDoc.organizationId && duplicate.organizationId) {
    canonicalDoc.organizationId = duplicate.organizationId;
  }
  if (!canonicalDoc.cityId && duplicate.cityId) {
    canonicalDoc.cityId = duplicate.cityId;
  }
  if (!canonicalDoc.branchId && duplicate.branchId) {
    canonicalDoc.branchId = duplicate.branchId;
  }
  if ((!canonicalDoc.contact || !String(canonicalDoc.contact).trim()) && duplicate.contact) {
    canonicalDoc.contact = duplicate.contact;
  }
  if ((!canonicalDoc.address || !String(canonicalDoc.address).trim()) && duplicate.address) {
    canonicalDoc.address = duplicate.address;
  }
  if ((!canonicalDoc.externalSource || !canonicalDoc.externalSourceId) && duplicate.externalSourceId) {
    canonicalDoc.externalSource = duplicate.externalSource || canonicalDoc.externalSource || "osm";
    canonicalDoc.externalSourceId = duplicate.externalSourceId;
  }
  await canonicalDoc.save();

  const queueResult = await QueueTicket.updateMany(
    { stationId: duplicateId },
    { $set: { stationId: canonicalId } }
  );
  const reportResult = await Report.updateMany(
    { stationId: duplicateId },
    { $set: { stationId: canonicalId } }
  );
  const addUserResult = await User.updateMany(
    { stationIds: duplicateId },
    { $addToSet: { stationIds: canonicalId } }
  );
  const pullUserResult = await User.updateMany(
    { stationIds: duplicateId },
    { $pull: { stationIds: duplicateId } }
  );

  await Station.deleteOne({ _id: duplicateId });

  return {
    queueModified: Number(queueResult.modifiedCount || 0),
    reportModified: Number(reportResult.modifiedCount || 0),
    userAddModified: Number(addUserResult.modifiedCount || 0),
    userPullModified: Number(pullUserResult.modifiedCount || 0)
  };
}

async function main() {
  const maxDistanceMeters = Number(getArg("distance", "150")) || 150;
  const apply = hasFlag("apply");

  await connectDB();

  const stations = await Station.find({})
    .select(
      "_id name address contact externalSource externalSourceId organizationId cityId branchId isActive createdAt location"
    )
    .lean();

  const mergePairs = buildMergePairs(stations, maxDistanceMeters);
  const uniqueDuplicates = new Set(mergePairs.map((pair) => String(pair.duplicate._id)));
  const uniqueCanonicals = new Set(mergePairs.map((pair) => String(pair.canonical._id)));

  console.log("Station merge scan complete.");
  console.log(`Stations scanned: ${stations.length}`);
  console.log(`Candidate duplicates: ${uniqueDuplicates.size}`);
  console.log(`Canonical stations involved: ${uniqueCanonicals.size}`);
  console.log(`Distance threshold: ${maxDistanceMeters}m`);

  if (!mergePairs.length) {
    console.log("No duplicate station candidates found.");
    await mongoose.disconnect();
    return;
  }

  console.log("Sample merge plan (first 20):");
  mergePairs.slice(0, 20).forEach((pair, index) => {
    console.log(
      `${index + 1}. DUP ${pair.duplicate._id} (${pair.duplicate.name}) -> KEEP ${pair.canonical._id} (${pair.canonical.name})`
    );
  });

  if (!apply) {
    console.log("Dry run only. Re-run with --apply to execute changes.");
    await mongoose.disconnect();
    return;
  }

  let totalQueueModified = 0;
  let totalReportModified = 0;
  let totalUserAdds = 0;
  let totalUserPulls = 0;
  let mergedCount = 0;

  for (const pair of mergePairs) {
    // eslint-disable-next-line no-await-in-loop
    const result = await applyMergePair(pair.duplicate, pair.canonical);
    if (result?.skipped) continue;
    mergedCount += 1;
    totalQueueModified += result.queueModified || 0;
    totalReportModified += result.reportModified || 0;
    totalUserAdds += result.userAddModified || 0;
    totalUserPulls += result.userPullModified || 0;
  }

  console.log("Merge completed.");
  console.log(`Station docs merged/deleted: ${mergedCount}`);
  console.log(`QueueTicket stationId updates: ${totalQueueModified}`);
  console.log(`Report stationId updates: ${totalReportModified}`);
  console.log(`User.stationIds add operations: ${totalUserAdds}`);
  console.log(`User.stationIds cleanup operations: ${totalUserPulls}`);

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("Merge failed:", error?.message || error);
  try {
    await mongoose.disconnect();
  } catch (_err) {
    // no-op
  }
  process.exit(1);
});

