const { fetchNearbyFuelStations, fetchDrivingRoute } = require("../services/mapService");
const Station = require("../models/Station");

function parseNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function normalizeStationName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function areLikelySameStation(sourceName, dbName) {
  const a = normalizeStationName(sourceName);
  const b = normalizeStationName(dbName);
  if (!a || !b) return false;
  if (a === b) return true;
  return a.includes(b) || b.includes(a);
}

function isPlaceholderAddress(value) {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return true;
  if (text === "address not listed") return true;
  return text.startsWith("approx location");
}

function buildAddressFromReversePayload(data) {
  const addr = data?.address || {};
  const line1 = [addr.house_number, addr.road].filter(Boolean).join(" ").trim();
  const locality =
    addr.neighbourhood ||
    addr.suburb ||
    addr.city_district ||
    addr.county ||
    "";
  const city = addr.city || addr.town || addr.village || addr.municipality || "";
  const region = addr.state || addr.region || "";
  const country = addr.country || "";
  const parts = [line1, locality, city, region, country]
    .map((item) => String(item || "").trim())
    .filter(Boolean);
  if (parts.length) return parts.join(", ");
  return String(data?.display_name || "").trim();
}

async function reverseGeocodeAddress(lat, lon) {
  const url =
    `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}` +
    `&lon=${encodeURIComponent(lon)}&zoom=18&addressdetails=1&accept-language=en`;
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "fuelfinder-backend/1.0"
    }
  });
  if (!response.ok) return "";
  const data = await response.json();
  return buildAddressFromReversePayload(data);
}

async function findNearbyCanonicalStation(station) {
  const lat = Number(station?.latitude);
  const lon = Number(station?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const nearby = await Station.find({
    location: {
      $near: {
        $geometry: { type: "Point", coordinates: [lon, lat] },
        $maxDistance: 120
      }
    }
  })
    .select("_id name externalSource externalSourceId")
    .limit(10)
    .lean();

  return (
    nearby.find((item) => areLikelySameStation(station?.name, item?.name)) ||
    nearby[0] ||
    null
  );
}

async function attachBackendStationIds(stations) {
  const mapped = await Promise.all(
    (stations || []).map(async (station) => {
      const lat = Number(station?.latitude);
      const lon = Number(station?.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return station;
      const sourceId = String(station?.id || "").trim();
      if (!sourceId) return station;

      let doc = await Station.findOne({
        externalSource: "osm",
        externalSourceId: sourceId
      });

      if (!doc) {
        const canonical = await findNearbyCanonicalStation(station);
        if (canonical) {
          doc = await Station.findById(canonical._id);
          if (doc && (!doc.externalSource || !doc.externalSourceId)) {
            doc.externalSource = "osm";
            doc.externalSourceId = sourceId;
          }
        }
      }

      if (!doc) {
        const incomingAddress = String(station?.address || "").trim();
        doc = await Station.create({
          name: String(station?.name || "Fuel Station").trim(),
          address: incomingAddress || "Address not listed",
          contact: String(station?.contact || "").trim(),
          externalSource: "osm",
          externalSourceId: sourceId,
          fuelStatus: "partial",
          isActive: true,
          location: { type: "Point", coordinates: [lon, lat] }
        });
      } else {
        const incomingAddress = String(station?.address || "").trim();
        doc.name = String(station?.name || doc.name || "Fuel Station").trim();
        if (!isPlaceholderAddress(incomingAddress)) {
          doc.address = incomingAddress;
        } else if (!String(doc.address || "").trim()) {
          doc.address = incomingAddress || "Address not listed";
        }
        doc.contact = String(station?.contact || doc.contact || "").trim();
        doc.location = { type: "Point", coordinates: [lon, lat] };
        doc.isActive = true;

        // Self-heal legacy placeholder addresses using reverse geocoding.
        if (isPlaceholderAddress(doc.address)) {
          try {
            // eslint-disable-next-line no-await-in-loop
            const resolvedAddress = await reverseGeocodeAddress(lat, lon);
            if (resolvedAddress && !isPlaceholderAddress(resolvedAddress)) {
              doc.address = resolvedAddress;
            }
          } catch (_err) {
            // keep current address if reverse geocoding fails
          }
        }

        await doc.save();
      }

      const docCoords = Array.isArray(doc?.location?.coordinates) ? doc.location.coordinates : [];
      const docLon = Number(docCoords[0]);
      const docLat = Number(docCoords[1]);

      return {
        ...station,
        name: String(doc?.name || station?.name || "Fuel Station"),
        address: String(doc?.address || station?.address || "Address not listed"),
        contact: String(doc?.contact || station?.contact || ""),
        fuel_status: String(doc?.fuelStatus || station?.fuel_status || "partial"),
        fuelInventory: {
          gasolineLiters: Number(doc?.fuelInventory?.gasolineLiters || 0),
          dieselLiters: Number(doc?.fuelInventory?.dieselLiters || 0),
          otherLiters: Number(doc?.fuelInventory?.otherLiters || 0),
          updatedAt: doc?.fuelInventory?.updatedAt || null
        },
        latitude: Number.isFinite(docLat) ? docLat : lat,
        longitude: Number.isFinite(docLon) ? docLon : lon,
        stationId: String(doc?._id || "")
      };
    })
  );

  return mapped;
}

exports.getNearbyFuelStations = async (req, res) => {
  try {
    const lat = parseNumber(req.query.lat);
    const lon = parseNumber(req.query.lon);
    const radius = parseNumber(req.query.radius) || 12000;
    if (lat === null || lon === null) {
      return res.status(400).json({ message: "lat and lon are required numeric query params." });
    }

    const stations = await fetchNearbyFuelStations(lat, lon, radius);
    const withBackendIds = await attachBackendStationIds(stations);
    return res.json({ stations: withBackendIds });
  } catch (error) {
    return res.status(500).json({ message: "Failed to load nearby fuel stations." });
  }
};

exports.getDrivingRoute = async (req, res) => {
  try {
    const fromLat = parseNumber(req.query.fromLat);
    const fromLon = parseNumber(req.query.fromLon);
    const toLat = parseNumber(req.query.toLat);
    const toLon = parseNumber(req.query.toLon);
    if (fromLat === null || fromLon === null || toLat === null || toLon === null) {
      return res.status(400).json({ message: "fromLat, fromLon, toLat, and toLon are required numeric query params." });
    }

    const route = await fetchDrivingRoute(fromLat, fromLon, toLat, toLon);
    return res.json(route);
  } catch (error) {
    return res.status(500).json({ message: "Failed to load driving route." });
  }
};
