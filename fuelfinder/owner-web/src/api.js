const DEV_DEFAULT_API_BASE = "http://localhost:3000/api";
const PROD_DEFAULT_API_BASE = "https://fuelfinder-2.onrender.com";
const API_BASE = String(
  import.meta.env.VITE_API_BASE_URL || (import.meta.env.DEV ? DEV_DEFAULT_API_BASE : PROD_DEFAULT_API_BASE)
).replace(/\/+$/, "");

const STORAGE_KEY = "ff_owner_session_v1";

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

async function apiRequest(path, options = {}, { auth = true, retry = true } = {}) {
  const session = loadSession();
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
      headers
    });
  } catch (_error) {
    const hint = import.meta.env.VITE_API_BASE_URL
      ? `API base is ${API_BASE}.`
      : `API base defaulted to ${API_BASE}. Set VITE_API_BASE_URL in owner-web/.env if needed (then restart dev server).`;
    throw new Error(`Request failed (network/CORS). ${hint}`);
  }

  if (response.status === 401 && auth && retry && session?.tokens?.refreshToken) {
    const refreshed = await refreshToken(session.tokens.refreshToken);
    if (refreshed?.tokens?.accessToken) {
      const nextSession = { ...session, tokens: refreshed.tokens };
      saveSession(nextSession);
      return apiRequest(path, options, { auth, retry: false });
    }
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.message || "Request failed.";
    throw new Error(message);
  }
  return payload;
}

export async function login(email, password) {
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
    clearSession();
  }
}

export async function getProfile() {
  return apiRequest("/auth/me");
}

export async function listOwnerStations() {
  return apiRequest("/owner/stations");
}

export async function getOwnerStation(stationId) {
  return apiRequest(`/owner/stations/${stationId}`);
}

export async function getStationQueue(stationId) {
  return apiRequest(`/queue/station/${stationId}?includePending=true`, {}, { auth: false });
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
  return apiRequest(`/owner/stations/${stationId}/payments${query ? `?${query}` : ""}`);
}

export async function listStationTeam(stationId) {
  return apiRequest(`/owner/stations/${stationId}/team`);
}

export async function listStationPromotions(stationId) {
  return apiRequest(`/owner/stations/${stationId}/promotions`);
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
  return apiRequest("/admin/users");
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
  return apiRequest("/admin/organizations/options");
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
