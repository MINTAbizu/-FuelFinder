const DEV_DEFAULT_API_BASE = "http://localhost:3000/api";
const PROD_DEFAULT_API_BASE = "https://fuelfinder-2.onrender.com";
const API_BASE = String(
  import.meta.env.VITE_API_BASE_URL || (import.meta.env.DEV ? DEV_DEFAULT_API_BASE : PROD_DEFAULT_API_BASE)
).replace(/\/+$/, "");

const STORAGE_KEY = "ff_owner_session_v1";
const GET_CACHE = new Map();
const INFLIGHT_GET_REQUESTS = new Map();
const MAX_CACHE_ENTRIES = 200;

function buildCacheKey(path, session) {
  return `${String(session?.user?.id || "guest")}:${String(path || "")}`;
}

function getCachedResponse(cacheKey) {
  const entry = GET_CACHE.get(cacheKey);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) return null;
  return entry.value;
}

function setCachedResponse(cacheKey, value, ttlMs) {
  GET_CACHE.set(cacheKey, {
    value,
    expiresAt: Date.now() + ttlMs
  });

  if (GET_CACHE.size > MAX_CACHE_ENTRIES) {
    const oldestKey = GET_CACHE.keys().next().value;
    if (oldestKey) {
      GET_CACHE.delete(oldestKey);
    }
  }
}

function clearRequestCache() {
  GET_CACHE.clear();
  INFLIGHT_GET_REQUESTS.clear();
}

export function loadSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveSession(session) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function clearSession() {
  localStorage.removeItem(STORAGE_KEY);
}

async function apiRequest(path, options = {}, { auth = true, retry = true, cacheTtlMs = 0 } = {}) {
  const session = loadSession();
  const method = String(options.method || "GET").toUpperCase();
  const cacheKey = method === "GET" && cacheTtlMs > 0 ? buildCacheKey(path, session) : "";

  if (cacheKey) {
    const cached = getCachedResponse(cacheKey);
    if (cached) {
      return cached;
    }
    if (INFLIGHT_GET_REQUESTS.has(cacheKey)) {
      return INFLIGHT_GET_REQUESTS.get(cacheKey);
    }
  }

  const requestPromise = (async () => {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {})
  };

  if (auth && session?.tokens?.accessToken) {
    headers.Authorization = `Bearer ${session.tokens.accessToken}`;
  }

  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...options,
      method,
      headers
    });
  } catch (_error) {
    const hint = import.meta.env.VITE_API_BASE_URL
      ? `API base is ${API_BASE}.`
      : `API base defaulted to ${API_BASE}. Set VITE_API_BASE_URL in owner-web/.env if needed (then restart dev server).`;
    throw new Error(`Request failed (network/CORS). ${hint}`);
  }

  if (response.status === 401 && auth && retry && session?.tokens?.refreshToken) {
    if (cacheKey) {
      INFLIGHT_GET_REQUESTS.delete(cacheKey);
    }
    const refreshed = await refreshToken(session.tokens.refreshToken);
    if (refreshed?.tokens?.accessToken) {
      const nextSession = { ...session, tokens: refreshed.tokens };
      saveSession(nextSession);
      return apiRequest(path, options, { auth, retry: false, cacheTtlMs });
    }
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.message || "Request failed.";
    throw new Error(message);
  }

   if (method !== "GET") {
    clearRequestCache();
  } else if (cacheKey) {
    setCachedResponse(cacheKey, payload, cacheTtlMs);
  }

  return payload;
  })();

  if (cacheKey) {
    INFLIGHT_GET_REQUESTS.set(cacheKey, requestPromise);
  }

  try {
    return await requestPromise;
  } finally {
    if (cacheKey) {
      INFLIGHT_GET_REQUESTS.delete(cacheKey);
    }
  }
}

export async function login(email, password) {
  clearRequestCache();
  const data = await apiRequest(
    "/auth/login",
    {
      method: "POST",
      body: JSON.stringify({ email, password })
    },
    { auth: false }
  );
  const session = { user: data.user, tokens: data.tokens };
  saveSession(session);
  return session;
}

export async function logout() {
  try {
    await apiRequest("/auth/logout", { method: "POST" });
  } finally {
    clearRequestCache();
    clearSession();
  }
}

export async function getProfile() {
  return apiRequest("/auth/me");
}

export async function listOwnerStations() {
  return apiRequest("/owner/stations", {}, { cacheTtlMs: 1000 * 60 });
}

export async function getOwnerStation(stationId) {
  return apiRequest(`/owner/stations/${stationId}`, {}, { cacheTtlMs: 1000 * 30 });
}

export async function getStationQueue(stationId) {
  return apiRequest(
    `/queue/station/${stationId}?includePending=true`,
    {},
    { auth: false, cacheTtlMs: 1000 * 15 }
  );
}

export async function updateFuelStock(stationId, payload) {
  return apiRequest(`/queue/station/${stationId}/fuel-stock`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
}

export async function callNextInQueue(stationId) {
  return apiRequest("/queue/next", {
    method: "POST",
    body: JSON.stringify({ stationId })
  });
}

export async function updateOwnerStation(stationId, payload) {
  return apiRequest(`/owner/stations/${stationId}`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
}

export async function listStationPayments(stationId, params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    search.set(key, String(value));
  });
  const query = search.toString();
  return apiRequest(`/owner/stations/${stationId}/payments${query ? `?${query}` : ""}`, {}, { cacheTtlMs: 1000 * 30 });
}

export async function listStationTeam(stationId) {
  return apiRequest(`/owner/stations/${stationId}/team`, {}, { cacheTtlMs: 1000 * 30 });
}

export async function listStationPromotions(stationId) {
  return apiRequest(`/owner/stations/${stationId}/promotions`, {}, { cacheTtlMs: 1000 * 30 });
}

export async function createStationPromotion(stationId, payload) {
  return apiRequest(`/owner/stations/${stationId}/promotions`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function updateStationPromotion(stationId, promotionId, payload) {
  return apiRequest(`/owner/stations/${stationId}/promotions/${promotionId}`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
}

export async function createStationTeamUser(stationId, payload) {
  return apiRequest(`/owner/stations/${stationId}/team`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function updateStationTeamUser(stationId, userId, payload) {
  return apiRequest(`/owner/stations/${stationId}/team/${userId}`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
}

export async function setStationTeamUserBlocked(stationId, userId, isBlocked) {
  return apiRequest(`/owner/stations/${stationId}/team/${userId}/block`, {
    method: "PATCH",
    body: JSON.stringify({ isBlocked: Boolean(isBlocked) })
  });
}

export async function forceLogoutStationTeamUser(stationId, userId) {
  return apiRequest(`/owner/stations/${stationId}/team/${userId}/force-logout`, { method: "POST" });
}

export async function listAdminUsers() {
  return apiRequest("/admin/users", {}, { cacheTtlMs: 1000 * 30 });
}

export async function createAdminUser(payload) {
  return apiRequest("/admin/users/create-admin", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function updateAdminUser(userId, payload) {
  return apiRequest(`/admin/users/${userId}`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
}

export async function setAdminUserBlocked(userId, isBlocked) {
  return apiRequest(`/admin/users/${userId}/block`, {
    method: "PATCH",
    body: JSON.stringify({ isBlocked: Boolean(isBlocked) })
  });
}

export async function forceLogoutAdminUser(userId) {
  return apiRequest(`/admin/users/${userId}/force-logout`, { method: "POST" });
}

export async function listOrganizationOptions() {
  return apiRequest("/admin/organizations/options", {}, { cacheTtlMs: 1000 * 60 * 10 });
}

export async function createAdminStation(payload) {
  return apiRequest("/admin/stations", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function updateAdminStation(stationId, payload) {
  return apiRequest(`/admin/stations/${stationId}`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
}

async function refreshToken(refreshTokenValue) {
  return apiRequest(
    "/auth/refresh",
    {
      method: "POST",
      body: JSON.stringify({ refreshToken: refreshTokenValue })
    },
    { auth: false, retry: false }
  );
}
