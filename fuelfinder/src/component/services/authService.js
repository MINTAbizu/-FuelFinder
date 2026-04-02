import api from "./api";
import {
  buildOfflineCacheKey,
  enqueueOfflineAction,
  isNetworkError,
  requestWithOfflineCache,
} from "./offlineService";

function buildAuthOverrideConfig(options = {}) {
  const accessToken = String(options?.accessToken || "").trim();
  if (!accessToken) return undefined;
  return {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  };
}

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
  return requestWithOfflineCache({
    cacheKey: buildOfflineCacheKey("auth.me"),
    maxAgeMs: 1000 * 60 * 60 * 6,
    request: async () => {
      const { data } = await api.get("/auth/me");
      return data;
    },
  });
}

export async function updateMyProfile(payload) {
  try {
    const { data } = await api.patch("/auth/me", payload);
    return data;
  } catch (error) {
    if (!isNetworkError(error)) {
      throw error;
    }

    const queuedAction = await enqueueOfflineAction({
      type: "profile.update",
      payload,
    });

    return {
      offlineQueued: true,
      queueId: queuedAction.id,
      message: "Profile changes saved offline. They will sync when you reconnect.",
      payload,
    };
  }
}

export async function registerDevicePushToken(payload) {
  const { data } = await api.post("/auth/push-token", payload);
  return data;
}

export async function unregisterDevicePushToken(payload, options = {}) {
  const { data } = await api.post(
    "/auth/push-token/remove",
    payload,
    buildAuthOverrideConfig(options)
  );
  return data;
}

export async function registerBiometricLogin(payload) {
  const { data } = await api.post("/auth/biometric/register", payload);
  return data;
}

export async function biometricLogin(payload) {
  const { data } = await api.post("/auth/biometric/login", payload);
  return data;
}

export async function unregisterBiometricLogin(payload) {
  const { data } = await api.post("/auth/biometric/unregister", payload);
  return data;
}

export async function logoutUser(options = {}) {
  const { data } = await api.post("/auth/logout", {}, buildAuthOverrideConfig(options));
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
