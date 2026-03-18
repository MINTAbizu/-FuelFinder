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

export async function updateMyProfile(payload) {
  const { data } = await api.patch("/auth/me", payload);
  return data;
}

export async function logoutUser() {
  const { data } = await api.post("/auth/logout");
  return data;
}

export async function changeMyPassword(payload) {
  const { data } = await api.post("/auth/change-password", payload);
  return data;
}

export async function startTwoFactorSetup() {
  const { data } = await api.post("/auth/two-factor/start");
  return data;
}

export async function verifyPhoneOtp(payload) {
  const { data } = await api.post("/auth/phone/verify", payload);
  return data;
}

export async function resendPhoneOtp(payload) {
  const { data } = await api.post("/auth/phone/resend", payload);
  return data;
}

export async function verifyTwoFactorOtp(payload) {
  const { data } = await api.post("/auth/two-factor/verify", payload);
  return data;
}

export async function resendTwoFactorOtp(payload) {
  const { data } = await api.post("/auth/two-factor/resend", payload);
  return data;
}

export async function disableTwoFactorAuth() {
  const { data } = await api.post("/auth/two-factor/disable");
  return data;
}

export async function loginWithGoogle(idToken) {
  const { data } = await api.post("/auth/google", { idToken });
  return data;
}
