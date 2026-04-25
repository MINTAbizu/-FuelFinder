import api from "./api";
import {
  buildOfflineCacheKey,
  isNetworkError,
  readCachedOfflineData,
  writeCachedOfflineData,
} from "./offlineService";

export const STATION_DIRECTORY_OFFLINE_TTL_MS = 1000 * 60 * 60 * 24 * 7;

function normalizeStationType(value) {
  const stationType = String(value || "").trim().toLowerCase();
  if (stationType === "fuel" || stationType === "electric") {
    return stationType;
  }
  return "fuel";
}

async function fetchWithOfflineListCache({ namespace, params, maxAgeMs, request }) {
  const cacheKey = buildOfflineCacheKey(namespace, params);

  try {
    const data = await request();
    await writeCachedOfflineData(cacheKey, data);
    return {
      data,
      fromCache: false,
    };
  } catch (error) {
    if (!isNetworkError(error)) {
      throw error;
    }

    const cached = await readCachedOfflineData(cacheKey, maxAgeMs);
    if (cached !== null) {
      return {
        data: cached,
        fromCache: true,
      };
    }

    throw error;
  }
}

export async function fetchBrowseCities(params = {}) {
  const normalizedParams = {
    q: String(params?.q || "").trim(),
    limit: Number(params?.limit || 20),
    stationType: normalizeStationType(params?.stationType),
  };

  const result = await fetchWithOfflineListCache({
    namespace: "map.cities",
    params: normalizedParams,
    maxAgeMs: STATION_DIRECTORY_OFFLINE_TTL_MS,
    request: async () => {
      const { data } = await api.get("/map/cities", {
        params: {
          q: normalizedParams.q || undefined,
          limit: normalizedParams.limit,
          stationType: normalizedParams.stationType,
        },
      });

      return Array.isArray(data?.cities) ? data.cities : [];
    },
  });

  return {
    cities: Array.isArray(result.data) ? result.data : [],
    fromCache: result.fromCache,
  };
}

export async function fetchCurrentDirectoryCity(params = {}) {
  const normalizedParams = {
    lat: Number(params?.lat),
    lon: Number(params?.lon),
    stationType: normalizeStationType(params?.stationType),
  };

  if (!Number.isFinite(normalizedParams.lat) || !Number.isFinite(normalizedParams.lon)) {
    return {
      city: null,
      source: "",
    };
  }

  const { data } = await api.get("/map/current-city", {
    params: {
      lat: normalizedParams.lat,
      lon: normalizedParams.lon,
      stationType: normalizedParams.stationType,
    },
  });

  return {
    city: data?.city && typeof data.city === "object" ? data.city : null,
    source: String(data?.source || ""),
  };
}

export async function fetchDirectoryStations(params = {}) {
  const normalizedParams = {
    cityId: String(params?.cityId || "").trim(),
    regionId: String(params?.regionId || "").trim(),
    q: String(params?.q || "").trim(),
    limit: Number(params?.limit || 120),
    stationType: normalizeStationType(params?.stationType),
    strictCity: params?.strictCity === true,
  };

  const result = await fetchWithOfflineListCache({
    namespace: "map.stations",
    params: normalizedParams,
    maxAgeMs: STATION_DIRECTORY_OFFLINE_TTL_MS,
    request: async () => {
      const { data } = await api.get("/map/stations", {
        params: {
          cityId: normalizedParams.cityId || undefined,
          regionId: normalizedParams.regionId || undefined,
          q: normalizedParams.q || undefined,
          limit: normalizedParams.limit,
          stationType: normalizedParams.stationType,
          strictCity: normalizedParams.strictCity || undefined,
        },
      });

      return Array.isArray(data?.stations) ? data.stations : [];
    },
  });

  return {
    stations: Array.isArray(result.data) ? result.data : [],
    fromCache: result.fromCache,
  };
}
