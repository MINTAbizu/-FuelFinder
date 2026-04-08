import { makeRedirectUri } from "expo-auth-session";

function sanitizeClientId(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("YOUR_")) return "";
  return trimmed;
}

export function buildGoogleAuthConfig() {
  const webClientId = sanitizeClientId(process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID);
  const iosClientId = sanitizeClientId(process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID);
  const androidClientId = sanitizeClientId(process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID);

  return {
    // Keep a generic fallback so Expo Go/dev flows can still initialize while
    // native iOS and Android builds prefer their platform-specific client IDs.
    clientId: webClientId || iosClientId || androidClientId || undefined,
    webClientId: webClientId || undefined,
    iosClientId: iosClientId || undefined,
    androidClientId: androidClientId || undefined,
    scopes: ["profile", "email"],
    selectAccount: true,
    redirectUri: makeRedirectUri({ path: "oauthredirect" }),
  };
}
