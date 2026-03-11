const API_BASE =
  import.meta.env.VITE_API_BASE_URL?.replace(/\/+$/, "") || "http://localhost:5000/api";

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

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers
  });

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
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function callNextInQueue(stationId) {
  return apiRequest("/queue/next", {
    method: "POST",
    body: JSON.stringify({ stationId })
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

