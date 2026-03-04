import "react-native-gesture-handler";
import React from "react";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaProvider } from "react-native-safe-area-context";
import HomeScreen from "./src/component/screens/home/HomeScreen";
import StationDetails from "./src/component/screens/home/StationDetails";
import LoginScreen from "./src/component/screens/auth/LoginScreen";
import RegisterScreen from "./src/component/screens/auth/RegisterScreen";
import { AuthProvider, useAuth } from "./src/component/context/AuthContext";
import { LanguageProvider, useLanguage } from "./src/component/context/LanguageContext";

const queryClient = new QueryClient();
const RootStack = createNativeStackNavigator();
const HomeStack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function LoadingScreen() {
  const { t } = useLanguage();
  return (
    <View style={styles.loadingScreen}>
      <ActivityIndicator size="large" color="#0F766E" />
      <Text style={styles.loadingText}>{t("loadingSession")}</Text>
    </View>
  );
}

function PlaceholderScreen({ title }) {
  const { t } = useLanguage();
  return (
    <View style={styles.placeholderScreen}>
      <Text style={styles.placeholderTitle}>{title}</Text>
      <Text style={styles.placeholderSubTitle}>{t("comingSoon")}</Text>
    </View>
  );
}

function ProfileScreen() {
  const { user, signOut } = useAuth();
  const { t, changeLanguage, language } = useLanguage();
  const qc = useQueryClient();

  const PREF_KEYS = React.useMemo(
    () => ({
      darkMode: "ff_pref_dark_mode",
      pushNotifs: "ff_pref_push_notifs",
      emailNotifs: "ff_pref_email_notifs",
      priceAlerts: "ff_pref_price_alerts",
      locationSharing: "ff_pref_location_sharing",
      biometricUnlock: "ff_pref_biometric_unlock",
      twoFactor: "ff_pref_two_factor",
      dataSaver: "ff_pref_data_saver",
      autoRefreshPrices: "ff_pref_auto_refresh_prices",
      units: "ff_pref_units",
      preferredFuel: "ff_pref_preferred_fuel",
    }),
    []
  );

  const [prefs, setPrefs] = React.useState({
    darkMode: false,
    pushNotifs: true,
    emailNotifs: true,
    priceAlerts: true,
    locationSharing: true,
    biometricUnlock: false,
    twoFactor: false,
    dataSaver: false,
    autoRefreshPrices: true,
    units: "metric", // metric | imperial
    preferredFuel: "gasoline", // gasoline | diesel | electric
  });
  const [prefsReady, setPrefsReady] = React.useState(false);

  React.useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const keys = Object.values(PREF_KEYS);
        const entries = await AsyncStorage.multiGet(keys);
        const byKey = Object.fromEntries(entries);

        const readBool = (k, fallback) => {
          const v = byKey[k];
          if (v === "1") return true;
          if (v === "0") return false;
          return fallback;
        };
        const readStr = (k, fallback) => (byKey[k] ? byKey[k] : fallback);

        const nextUnits = readStr(PREF_KEYS.units, "metric");
        const nextFuel = readStr(PREF_KEYS.preferredFuel, "gasoline");

        const next = {
          darkMode: readBool(PREF_KEYS.darkMode, false),
          pushNotifs: readBool(PREF_KEYS.pushNotifs, true),
          emailNotifs: readBool(PREF_KEYS.emailNotifs, true),
          priceAlerts: readBool(PREF_KEYS.priceAlerts, true),
          locationSharing: readBool(PREF_KEYS.locationSharing, true),
          biometricUnlock: readBool(PREF_KEYS.biometricUnlock, false),
          twoFactor: readBool(PREF_KEYS.twoFactor, false),
          dataSaver: readBool(PREF_KEYS.dataSaver, false),
          autoRefreshPrices: readBool(PREF_KEYS.autoRefreshPrices, true),
          units: nextUnits === "imperial" ? "imperial" : "metric",
          preferredFuel:
            nextFuel === "diesel" || nextFuel === "electric" ? nextFuel : "gasoline",
        };

        if (mounted) setPrefs(next);
      } finally {
        if (mounted) setPrefsReady(true);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [PREF_KEYS]);

  const persistBool = React.useCallback(async (key, next) => {
    await AsyncStorage.setItem(key, next ? "1" : "0");
  }, []);

  const togglePref = React.useCallback(
    async (field, storageKey) => {
      const next = !prefs[field];
      setPrefs((p) => ({ ...p, [field]: next }));
      try {
        await persistBool(storageKey, next);
      } catch (_err) {
        setPrefs((p) => ({ ...p, [field]: !next }));
      }
    },
    [persistBool, prefs]
  );

  const setStringPref = React.useCallback(async (field, storageKey, nextValue) => {
    setPrefs((p) => ({ ...p, [field]: nextValue }));
    try {
      await AsyncStorage.setItem(storageKey, nextValue);
    } catch (_err) {
      // ignore; UI stays updated
    }
  }, []);

  const openUrl = React.useCallback(async (url) => {
    try {
      const can = await Linking.canOpenURL(url);
      if (!can) throw new Error("cannot_open");
      await Linking.openURL(url);
    } catch (_err) {
      Alert.alert(t("unableToOpenLink"));
    }
  }, [t]);

  const confirmAction = React.useCallback((title, message, onConfirm) => {
    Alert.alert(title, message, [
      { text: t("cancel"), style: "cancel" },
      { text: t("confirm"), style: "destructive", onPress: onConfirm },
    ]);
  }, [t]);

  const onClearCache = React.useCallback(() => {
    confirmAction(t("clearCache"), t("clearCacheConfirm"), async () => {
      try {
        qc.clear();
        await AsyncStorage.multiRemove(Object.values(PREF_KEYS));
        setPrefs({
          darkMode: false,
          pushNotifs: true,
          emailNotifs: true,
          priceAlerts: true,
          locationSharing: true,
          biometricUnlock: false,
          twoFactor: false,
          dataSaver: false,
          autoRefreshPrices: true,
          units: "metric",
          preferredFuel: "gasoline",
        });
        Alert.alert(t("done"), t("cacheCleared"));
      } catch (_err) {
        Alert.alert(t("somethingWentWrong"));
      }
    });
  }, [PREF_KEYS, confirmAction, qc, t]);

  const onDeleteAccount = React.useCallback(() => {
    confirmAction(t("deleteAccount"), t("deleteAccountConfirm"), async () => {
      // TODO: wire to backend delete endpoint when available.
      await signOut();
    });
  }, [confirmAction, signOut, t]);

  const SettingRow = React.useCallback(
    ({
      icon,
      title,
      subtitle,
      valueText,
      onPress,
      right,
      disabled,
      danger,
    }) => {
      return (
        <Pressable
          onPress={disabled ? undefined : onPress}
          style={({ pressed }) => [
            styles.settingRow,
            pressed && !disabled && styles.settingRowPressed,
            danger && styles.settingRowDanger,
            disabled && styles.settingRowDisabled,
          ]}
          accessibilityRole={onPress ? "button" : "none"}
        >
          <View style={styles.settingLeft}>
            <View style={[styles.settingIconWrap, danger && styles.settingIconWrapDanger]}>
              <Ionicons
                name={icon}
                size={18}
                color={danger ? "#991B1B" : "#0F172A"}
              />
            </View>
            <View style={styles.settingTextWrap}>
              <Text style={[styles.settingTitle, danger && styles.settingTitleDanger]}>
                {title}
              </Text>
              {subtitle ? <Text style={styles.settingSubtitle}>{subtitle}</Text> : null}
            </View>
          </View>
          <View style={styles.settingRight}>
            {valueText ? <Text style={styles.settingValue}>{valueText}</Text> : null}
            {right ? right : onPress ? (
              <Ionicons name="chevron-forward" size={18} color="#64748B" />
            ) : null}
          </View>
        </Pressable>
      );
    },
    []
  );

  const displayName = user?.name || "-";
  const displayEmail = user?.email || "-";
  const avatarLetter = (user?.name || user?.email || "?").trim().slice(0, 1).toUpperCase();

  return (
    <ScrollView
      style={styles.profileScreen}
      contentContainerStyle={styles.profileContent}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.profileTitle}>{t("profile")}</Text>

      <View style={styles.profileHeaderCard}>
        <View style={styles.avatarCircle}>
          <Text style={styles.avatarLetter}>{avatarLetter}</Text>
        </View>
        <View style={styles.profileHeaderText}>
          <Text style={styles.profileName} numberOfLines={1}>{displayName}</Text>
          <Text style={styles.profileEmail} numberOfLines={1}>{displayEmail}</Text>
          <Text style={styles.profileMeta} numberOfLines={1}>
            {t("signedInOn")} {Platform.OS === "ios" ? "iOS" : Platform.OS === "android" ? "Android" : "Web"}
          </Text>
        </View>
      </View>

      {!prefsReady ? (
        <View style={styles.inlineLoading}>
          <ActivityIndicator size="small" color="#0F766E" />
          <Text style={styles.inlineLoadingText}>{t("loadingSettings")}</Text>
        </View>
      ) : null}

      <Text style={styles.sectionTitle}>{t("account")}</Text>
      <View style={styles.sectionCard}>
        <SettingRow
          icon="create-outline"
          title={t("editProfile")}
          subtitle={t("editProfileSubtitle")}
          onPress={() => Alert.alert(t("comingSoon"))}
        />
        <SettingRow
          icon="key-outline"
          title={t("changePassword")}
          subtitle={t("changePasswordSubtitle")}
          onPress={() => Alert.alert(t("comingSoon"))}
        />
        <SettingRow
          icon="car-outline"
          title={t("myVehicles")}
          subtitle={t("myVehiclesSubtitle")}
          onPress={() => Alert.alert(t("comingSoon"))}
        />
        <SettingRow
          icon="bookmark-outline"
          title={t("savedStations")}
          subtitle={t("savedStationsSubtitle")}
          onPress={() => Alert.alert(t("comingSoon"))}
        />
      </View>

      <Text style={styles.sectionTitle}>{t("preferences")}</Text>
      <View style={styles.sectionCard}>
        <SettingRow
          icon="moon-outline"
          title={t("darkMode")}
          subtitle={t("darkModeSubtitle")}
          onPress={() => togglePref("darkMode", PREF_KEYS.darkMode)}
          right={
            <Switch
              value={prefs.darkMode}
              onValueChange={() => togglePref("darkMode", PREF_KEYS.darkMode)}
            />
          }
        />

        <View style={styles.inlineRowHeader}>
          <View style={styles.inlineRowHeaderLeft}>
            <View style={styles.settingIconWrap}>
              <Ionicons name="speedometer-outline" size={18} color="#0F172A" />
            </View>
            <View style={styles.settingTextWrap}>
              <Text style={styles.settingTitle}>{t("units")}</Text>
              <Text style={styles.settingSubtitle}>{t("unitsSubtitle")}</Text>
            </View>
          </View>
          <Text style={styles.settingValue}>
            {prefs.units === "imperial" ? t("unitsImperial") : t("unitsMetric")}
          </Text>
        </View>
        <View style={styles.chipRow}>
          <Pressable
            style={[styles.chip, prefs.units === "metric" && styles.chipActive]}
            onPress={() => setStringPref("units", PREF_KEYS.units, "metric")}
          >
            <Text style={[styles.chipText, prefs.units === "metric" && styles.chipTextActive]}>
              {t("unitsMetric")}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.chip, prefs.units === "imperial" && styles.chipActive]}
            onPress={() => setStringPref("units", PREF_KEYS.units, "imperial")}
          >
            <Text style={[styles.chipText, prefs.units === "imperial" && styles.chipTextActive]}>
              {t("unitsImperial")}
            </Text>
          </Pressable>
        </View>

        <View style={styles.inlineRowHeader}>
          <View style={styles.inlineRowHeaderLeft}>
            <View style={styles.settingIconWrap}>
              <Ionicons name="flame-outline" size={18} color="#0F172A" />
            </View>
            <View style={styles.settingTextWrap}>
              <Text style={styles.settingTitle}>{t("preferredFuel")}</Text>
              <Text style={styles.settingSubtitle}>{t("preferredFuelSubtitle")}</Text>
            </View>
          </View>
          <Text style={styles.settingValue}>
            {prefs.preferredFuel === "diesel"
              ? t("fuelDiesel")
              : prefs.preferredFuel === "electric"
                ? t("fuelElectric")
                : t("fuelGasoline")}
          </Text>
        </View>
        <View style={styles.chipRow}>
          <Pressable
            style={[styles.chip, prefs.preferredFuel === "gasoline" && styles.chipActive]}
            onPress={() => setStringPref("preferredFuel", PREF_KEYS.preferredFuel, "gasoline")}
          >
            <Text style={[styles.chipText, prefs.preferredFuel === "gasoline" && styles.chipTextActive]}>
              {t("fuelGasoline")}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.chip, prefs.preferredFuel === "diesel" && styles.chipActive]}
            onPress={() => setStringPref("preferredFuel", PREF_KEYS.preferredFuel, "diesel")}
          >
            <Text style={[styles.chipText, prefs.preferredFuel === "diesel" && styles.chipTextActive]}>
              {t("fuelDiesel")}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.chip, prefs.preferredFuel === "electric" && styles.chipActive]}
            onPress={() => setStringPref("preferredFuel", PREF_KEYS.preferredFuel, "electric")}
          >
            <Text style={[styles.chipText, prefs.preferredFuel === "electric" && styles.chipTextActive]}>
              {t("fuelElectric")}
            </Text>
          </Pressable>
        </View>

        <Text style={styles.languageTitle}>{t("selectLanguage")}</Text>
        <View style={styles.languageRow}>
          <Pressable
            style={[styles.languageChip, language === "am" && styles.languageChipActive]}
            onPress={() => changeLanguage("am")}
          >
            <Text style={[styles.languageChipText, language === "am" && styles.languageChipTextActive]}>
              {t("langAm")}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.languageChip, language === "om" && styles.languageChipActive]}
            onPress={() => changeLanguage("om")}
          >
            <Text style={[styles.languageChipText, language === "om" && styles.languageChipTextActive]}>
              {t("langOm")}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.languageChip, language === "en" && styles.languageChipActive]}
            onPress={() => changeLanguage("en")}
          >
            <Text style={[styles.languageChipText, language === "en" && styles.languageChipTextActive]}>
              {t("langEn")}
            </Text>
          </Pressable>
        </View>
      </View>

      <Text style={styles.sectionTitle}>{t("notifications")}</Text>
      <View style={styles.sectionCard}>
        <SettingRow
          icon="notifications-outline"
          title={t("pushNotifications")}
          subtitle={t("pushNotificationsSubtitle")}
          onPress={() => togglePref("pushNotifs", PREF_KEYS.pushNotifs)}
          right={
            <Switch
              value={prefs.pushNotifs}
              onValueChange={() => togglePref("pushNotifs", PREF_KEYS.pushNotifs)}
            />
          }
        />
        <SettingRow
          icon="mail-outline"
          title={t("emailNotifications")}
          subtitle={t("emailNotificationsSubtitle")}
          onPress={() => togglePref("emailNotifs", PREF_KEYS.emailNotifs)}
          right={
            <Switch
              value={prefs.emailNotifs}
              onValueChange={() => togglePref("emailNotifs", PREF_KEYS.emailNotifs)}
            />
          }
        />
        <SettingRow
          icon="pricetag-outline"
          title={t("priceAlerts")}
          subtitle={t("priceAlertsSubtitle")}
          onPress={() => togglePref("priceAlerts", PREF_KEYS.priceAlerts)}
          right={
            <Switch
              value={prefs.priceAlerts}
              onValueChange={() => togglePref("priceAlerts", PREF_KEYS.priceAlerts)}
            />
          }
        />
      </View>

      <Text style={styles.sectionTitle}>{t("privacyAndSecurity")}</Text>
      <View style={styles.sectionCard}>
        <SettingRow
          icon="location-outline"
          title={t("locationSharing")}
          subtitle={t("locationSharingSubtitle")}
          onPress={() => togglePref("locationSharing", PREF_KEYS.locationSharing)}
          right={
            <Switch
              value={prefs.locationSharing}
              onValueChange={() => togglePref("locationSharing", PREF_KEYS.locationSharing)}
            />
          }
        />
        <SettingRow
          icon="finger-print-outline"
          title={t("biometricUnlock")}
          subtitle={t("biometricUnlockSubtitle")}
          onPress={() => togglePref("biometricUnlock", PREF_KEYS.biometricUnlock)}
          right={
            <Switch
              value={prefs.biometricUnlock}
              onValueChange={() => togglePref("biometricUnlock", PREF_KEYS.biometricUnlock)}
            />
          }
        />
        <SettingRow
          icon="shield-checkmark-outline"
          title={t("twoFactorAuth")}
          subtitle={t("twoFactorAuthSubtitle")}
          onPress={() => togglePref("twoFactor", PREF_KEYS.twoFactor)}
          right={
            <Switch
              value={prefs.twoFactor}
              onValueChange={() => togglePref("twoFactor", PREF_KEYS.twoFactor)}
            />
          }
        />
      </View>

      <Text style={styles.sectionTitle}>{t("data")}</Text>
      <View style={styles.sectionCard}>
        <SettingRow
          icon="leaf-outline"
          title={t("dataSaver")}
          subtitle={t("dataSaverSubtitle")}
          onPress={() => togglePref("dataSaver", PREF_KEYS.dataSaver)}
          right={
            <Switch
              value={prefs.dataSaver}
              onValueChange={() => togglePref("dataSaver", PREF_KEYS.dataSaver)}
            />
          }
        />
        <SettingRow
          icon="refresh-outline"
          title={t("autoRefreshPrices")}
          subtitle={t("autoRefreshPricesSubtitle")}
          onPress={() => togglePref("autoRefreshPrices", PREF_KEYS.autoRefreshPrices)}
          right={
            <Switch
              value={prefs.autoRefreshPrices}
              onValueChange={() => togglePref("autoRefreshPrices", PREF_KEYS.autoRefreshPrices)}
            />
          }
        />
        <SettingRow
          icon="trash-outline"
          title={t("clearCache")}
          subtitle={t("clearCacheSubtitle")}
          onPress={onClearCache}
        />
      </View>

      <Text style={styles.sectionTitle}>{t("support")}</Text>
      <View style={styles.sectionCard}>
        <SettingRow
          icon="help-circle-outline"
          title={t("helpCenter")}
          subtitle={t("helpCenterSubtitle")}
          onPress={() => Alert.alert(t("comingSoon"))}
        />
        <SettingRow
          icon="chatbox-ellipses-outline"
          title={t("sendFeedback")}
          subtitle={t("sendFeedbackSubtitle")}
          onPress={() => openUrl("mailto:support@fuelfinder.app?subject=FuelFinder%20Feedback")}
        />
        <SettingRow
          icon="star-outline"
          title={t("rateApp")}
          subtitle={t("rateAppSubtitle")}
          onPress={() => Alert.alert(t("comingSoon"))}
        />
      </View>

      <Text style={styles.sectionTitle}>{t("about")}</Text>
      <View style={styles.sectionCard}>
        <SettingRow
          icon="information-circle-outline"
          title={t("appVersion")}
          subtitle={t("appVersionSubtitle")}
          valueText={"1.0.0"}
          disabled
        />
        <SettingRow
          icon="document-text-outline"
          title={t("termsOfService")}
          subtitle={t("termsOfServiceSubtitle")}
          onPress={() => openUrl("https://fuelfinder.app/terms")}
        />
        <SettingRow
          icon="lock-closed-outline"
          title={t("privacyPolicy")}
          subtitle={t("privacyPolicySubtitle")}
          onPress={() => openUrl("https://fuelfinder.app/privacy")}
        />
      </View>

      <Text style={styles.sectionTitle}>{t("dangerZone")}</Text>
      <View style={styles.sectionCard}>
        <SettingRow
          icon="warning-outline"
          title={t("deleteAccount")}
          subtitle={t("deleteAccountSubtitle")}
          onPress={onDeleteAccount}
          danger
        />
        <SettingRow
          icon="log-out-outline"
          title={t("logout")}
          subtitle={t("logoutSubtitle")}
          onPress={() => signOut()}
          danger
        />
      </View>

      <View style={styles.bottomSpacer} />
    </ScrollView>
  );
}







function HomeStackNavigator() {
  const { t } = useLanguage();
  return (
    <HomeStack.Navigator>
      <HomeStack.Screen
        name="HomeMain"
        component={HomeScreen}
        options={{ headerShown: false }}
      />
      <HomeStack.Screen
        name="StationDetails"
        component={StationDetails}
        options={{ title: t("stationDetails") }}
      />
    </HomeStack.Navigator>
  );
}

function AppTabs() {
  const { t } = useLanguage();
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: "#0F766E",
        tabBarInactiveTintColor: "#64748B",
        tabBarStyle: {
          height: 64,
          paddingTop: 6,
          paddingBottom: 8,
          borderTopWidth: 1,
          borderTopColor: "#E2E8F0",
          backgroundColor: "#FFFFFF",
        },
        tabBarLabelStyle: { fontSize: 12, fontWeight: "700" },
        tabBarIcon: ({ focused, color, size }) => {
          const iconByRoute = {
            Home: focused ? "home" : "home-outline",
            Map: focused ? "map" : "map-outline",
            Alerts: focused ? "notifications" : "notifications-outline",
            Profile: focused ? "person" : "person-outline",
          };
          return <Ionicons name={iconByRoute[route.name]} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Home" component={HomeStackNavigator} options={{ title: t("home") }} />
      <Tab.Screen
        name="Map"
        options={{ title: t("map") }}
        children={() => <PlaceholderScreen title={t("map")} />}
      />
      <Tab.Screen
        name="Alerts"
        options={{ title: t("alerts") }}
        children={() => <PlaceholderScreen title={t("alerts")} />}
      />
      <Tab.Screen name="Profile" component={ProfileScreen} options={{ title: t("profile") }} />
    </Tab.Navigator>
  );
}

function AuthStack() {
  return (
    <RootStack.Navigator screenOptions={{ headerShown: false }}>
      <RootStack.Screen name="Login" component={LoginScreen} />
      <RootStack.Screen name="Register" component={RegisterScreen} />
    </RootStack.Navigator>
  );
}

function AppNavigator() {
  const { isLoading, isAuthenticated } = useAuth();

  if (isLoading) {
    return <LoadingScreen />;
  }

  return (
    <NavigationContainer>
      {isAuthenticated ? <AppTabs /> : <AuthStack />}
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <LanguageProvider>
          <AuthProvider>
            <AppNavigator />
          </AuthProvider>
        </LanguageProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loadingScreen: {
    flex: 1,
    backgroundColor: "#F8FAFC",
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    marginTop: 10,
    color: "#475569",
    fontWeight: "700",
  },
  placeholderScreen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F8FAFC",
  },
  placeholderTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#0F172A",
    marginBottom: 4,
  },
  placeholderSubTitle: {
    fontSize: 14,
    color: "#64748B",
  },
  profileScreen: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  profileContent: {
    padding: 16,
  },
  profileTitle: {
    fontSize: 24,
    fontWeight: "900",
    color: "#0F172A",
    marginBottom: 10,
  },
  profileHeaderCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
  },
  avatarCircle: {
    width: 48,
    height: 48,
    borderRadius: 999,
    backgroundColor: "#0F766E",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarLetter: {
    color: "#FFFFFF",
    fontWeight: "900",
    fontSize: 18,
  },
  profileHeaderText: {
    flex: 1,
  },
  profileName: {
    fontSize: 16,
    fontWeight: "900",
    color: "#0F172A",
    marginBottom: 2,
  },
  profileEmail: {
    fontSize: 13,
    fontWeight: "700",
    color: "#475569",
    marginBottom: 2,
  },
  profileMeta: {
    fontSize: 12,
    color: "#64748B",
    fontWeight: "700",
  },
  inlineLoading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: 14,
  },
  inlineLoadingText: {
    color: "#475569",
    fontWeight: "800",
    fontSize: 13,
  },
  sectionTitle: {
    marginTop: 10,
    marginBottom: 8,
    fontSize: 12,
    color: "#0F172A",
    fontWeight: "900",
    letterSpacing: 0.7,
    textTransform: "uppercase",
  },
  sectionCard: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 16,
    overflow: "hidden",
  },
  settingRow: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#EEF2F6",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 56,
  },
  settingRowPressed: {
    backgroundColor: "#F8FAFC",
  },
  settingRowDisabled: {
    opacity: 0.7,
  },
  settingRowDanger: {
    backgroundColor: "#FFF7ED",
  },
  settingLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
    paddingRight: 10,
  },
  settingIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
  settingIconWrapDanger: {
    backgroundColor: "#FEE2E2",
  },
  settingTextWrap: {
    flex: 1,
  },
  settingTitle: {
    fontSize: 14,
    fontWeight: "900",
    color: "#0F172A",
  },
  settingTitleDanger: {
    color: "#991B1B",
  },
  settingSubtitle: {
    marginTop: 2,
    fontSize: 12,
    color: "#64748B",
    fontWeight: "700",
  },
  settingRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  settingValue: {
    color: "#475569",
    fontWeight: "800",
    fontSize: 12,
  },
  inlineRowHeader: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#EEF2F6",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  inlineRowHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
    paddingRight: 10,
  },
  chipRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 12,
    paddingBottom: 12,
    paddingTop: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#EEF2F6",
    flexWrap: "wrap",
  },
  languageTitle: {
    marginTop: 10,
    marginBottom: 6,
    fontSize: 13,
    color: "#0F172A",
    fontWeight: "800",
  },
  languageRow: {
    flexDirection: "row",
    gap: 8,
    paddingBottom: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#EEF2F6",
    flexWrap: "wrap",
  },
  chip: {
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "#F8FAFC",
  },
  chipActive: {
    borderColor: "#1D4ED8",
    backgroundColor: "#DBEAFE",
  },
  chipText: {
    color: "#334155",
    fontSize: 12,
    fontWeight: "700",
  },
  chipTextActive: {
    color: "#1D4ED8",
  },
  languageChip: {
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "#F8FAFC",
  },
  languageChipActive: {
    borderColor: "#1D4ED8",
    backgroundColor: "#DBEAFE",
  },
  languageChipText: {
    color: "#334155",
    fontSize: 12,
    fontWeight: "700",
  },
  languageChipTextActive: {
    color: "#1D4ED8",
  },
  bottomSpacer: {
    height: 24,
  },
});
