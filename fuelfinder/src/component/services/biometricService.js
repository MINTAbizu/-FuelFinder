import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import * as LocalAuthentication from "expo-local-authentication";
import { Platform } from "react-native";

const BIOMETRIC_LOGIN_META_KEY = "ff_biometric_login_meta";
const BIOMETRIC_LOGIN_SECRET_KEY = "ff_biometric_login_secret";
const BIOMETRIC_DEVICE_ID_KEY = "ff_biometric_device_id";

function buildDeviceId() {
  return `bio_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
}

function safeParse(rawValue, fallback) {
  if (!rawValue) return fallback;
  try {
    return JSON.parse(rawValue);
  } catch (_error) {
    return fallback;
  }
}

export function buildBiometricDeviceLabel() {
  if (Platform.OS === "ios") return "iPhone";
  if (Platform.OS === "android") return "Android phone";
  return "This device";
}

export async function getOrCreateBiometricDeviceId() {
  const existingId = (await AsyncStorage.getItem(BIOMETRIC_DEVICE_ID_KEY)) || "";
  if (existingId) return existingId;

  const nextId = buildDeviceId();
  await AsyncStorage.setItem(BIOMETRIC_DEVICE_ID_KEY, nextId);
  return nextId;
}

export async function saveBiometricLoginCredential({
  deviceId,
  biometricSecret,
  email,
  displayName,
}) {
  const payload = {
    deviceId: String(deviceId || "").trim(),
    biometricSecret: String(biometricSecret || "").trim(),
  };

  if (!payload.deviceId || !payload.biometricSecret) {
    throw new Error("Missing biometric credential for this device.");
  }

  const isSecureStoreAvailable = await SecureStore.isAvailableAsync();
  if (!isSecureStoreAvailable) {
    throw new Error("Secure storage is not available on this device.");
  }

  try {
    await SecureStore.setItemAsync(
      BIOMETRIC_LOGIN_SECRET_KEY,
      JSON.stringify(payload),
      {
        keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
      }
    );
  } catch (error) {
    const reason = String(error?.message || "").trim();
    throw new Error(
      reason ? `Secure biometric storage failed: ${reason}` : "Secure biometric storage failed."
    );
  }

  await AsyncStorage.setItem(
    BIOMETRIC_LOGIN_META_KEY,
    JSON.stringify({
      deviceId: payload.deviceId,
      email: String(email || "").trim().toLowerCase(),
      displayName: String(displayName || "").trim(),
      enabledAt: new Date().toISOString(),
    })
  );
}

export async function loadBiometricLoginMeta() {
  const raw = await AsyncStorage.getItem(BIOMETRIC_LOGIN_META_KEY);
  const meta = safeParse(raw, null);
  if (!meta?.deviceId) return null;
  return meta;
}

export async function updateBiometricLoginMeta(patch) {
  const current = (await loadBiometricLoginMeta()) || {};
  if (!current?.deviceId) return null;

  const next = {
    ...current,
    ...patch,
  };

  await AsyncStorage.setItem(BIOMETRIC_LOGIN_META_KEY, JSON.stringify(next));
  return next;
}

export async function loadBiometricLoginCredential() {
  const [hasHardware, isEnrolled] = await Promise.all([
    LocalAuthentication.hasHardwareAsync(),
    LocalAuthentication.isEnrolledAsync(),
  ]);

  if (!hasHardware || !isEnrolled) {
    return null;
  }

  const authResult = await LocalAuthentication.authenticateAsync({
    promptMessage: "Use biometrics to sign in to FuelFinder",
    cancelLabel: "Cancel",
    fallbackLabel: "Use passcode",
    disableDeviceFallback: false,
  });

  if (!authResult.success) {
    const authError = String(authResult.error || "").trim().toLowerCase();
    if (
      authError === "user_cancel" ||
      authError === "system_cancel" ||
      authError === "app_cancel"
    ) {
      throw new Error("Biometric authentication was canceled.");
    }
    throw new Error("Biometric authentication failed.");
  }

  const raw = await SecureStore.getItemAsync(BIOMETRIC_LOGIN_SECRET_KEY, {
    authenticationPrompt: "Use biometrics to sign in to FuelFinder",
  });
  const parsed = safeParse(raw, null);
  if (!parsed?.deviceId || !parsed?.biometricSecret) return null;
  return parsed;
}

export async function clearBiometricLoginCredential() {
  await SecureStore.deleteItemAsync(BIOMETRIC_LOGIN_SECRET_KEY);
  await AsyncStorage.removeItem(BIOMETRIC_LOGIN_META_KEY);
}
