// Dynamic Expo config so we can inject build-time secrets (like Google Maps API keys)
// without committing them to git.
const { expo: base } = require("./app.json");

module.exports = () => {
  const androidGoogleMapsApiKey =
    process.env.ANDROID_GOOGLE_MAPS_API_KEY ||
    process.env.GOOGLE_MAPS_API_KEY ||
    process.env.MAPS_API_KEY ||
    "";
  const iosGoogleMapsApiKey =
    process.env.IOS_GOOGLE_MAPS_API_KEY ||
    process.env.GOOGLE_MAPS_API_KEY ||
    process.env.MAPS_API_KEY ||
    "";

  if (!androidGoogleMapsApiKey) {
    // Keep this as a warning so `expo start` still works; but standalone/dev builds will crash
    // when loading Google Maps if you don't provide a key.
    // Set it in EAS (recommended): GOOGLE_MAPS_API_KEY / ANDROID_GOOGLE_MAPS_API_KEY.
    // Or set it locally before running `expo run:android`.
    // eslint-disable-next-line no-console
    console.warn(
      "[app.config.js] Missing GOOGLE_MAPS_API_KEY (or ANDROID_GOOGLE_MAPS_API_KEY). " +
        "Android Google Maps will crash at runtime without it."
    );
  }

  return {
    ...base,
    android: {
      ...(base.android || {}),
      // This is supported by Expo's built-in config plugins:
      // it injects <meta-data android:name="com.google.android.geo.API_KEY" ... />
      // into AndroidManifest.xml during prebuild.
      config: {
        ...((base.android && base.android.config) || {}),
        googleMaps: {
          ...(((base.android && base.android.config) || {}).googleMaps || {}),
          ...(androidGoogleMapsApiKey ? { apiKey: androidGoogleMapsApiKey } : {}),
        },
      },
    },
    ios: {
      ...(base.ios || {}),
      // Only needed if you use Google Maps on iOS.
      config: {
        ...((base.ios && base.ios.config) || {}),
        ...(iosGoogleMapsApiKey ? { googleMapsApiKey: iosGoogleMapsApiKey } : {}),
      },
    },
  };
};
