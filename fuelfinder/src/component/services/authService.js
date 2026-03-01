import api from "./api";

export async function registerUser(payload) {
  const { data } = await api.post("/auth/register", payload);
  return data;
}

export async function loginUser(payload) {
  const { data } = await api.post("/auth/login", payload);
  return data;
}

export async function refreshUserToken(refreshToken) {
  const { data } = await api.post("/auth/refresh", { refreshToken });
  return data;
}

export async function getMyProfile() {
  const { data } = await api.get("/auth/me");
  return data;
}

export async function logoutUser() {
  const { data } = await api.post("/auth/logout");
  return data;
}
