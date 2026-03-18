const { withGradleProperties } = require("@expo/config-plugins");

/**
 * Ensures AndroidX is enabled in the generated android/gradle.properties.
 *
 * EAS Build (managed workflow) generates the android project during prebuild.
 * If AndroidX isn't enabled there, Gradle fails with:
 * "Configuration ':app:releaseRuntimeClasspath' contains AndroidX dependencies,
 *  but the android.useAndroidX property is not enabled"
 */
module.exports = function withAndroidX(config) {
  return withGradleProperties(config, (cfg) => {
    cfg.modResults = upsertProp(cfg.modResults, "android.useAndroidX", "true");
    cfg.modResults = upsertProp(cfg.modResults, "android.enableJetifier", "true");
    // Required by react-native-worklets on this project.
    cfg.modResults = upsertProp(cfg.modResults, "newArchEnabled", "true");
    return cfg;
  });
};

function upsertProp(props, key, value) {
  const existing = props.find((p) => p.type === "property" && p.key === key);
  if (existing) {
    existing.value = value;
    return props;
  }
  return props.concat({ type: "property", key, value });
}
