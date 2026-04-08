import "react-native-gesture-handler";
import React from "react";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  ActivityIndicator,
  Alert,
  AppState,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { NavigationContainer, useFocusEffect } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import FuelAlertMonitor from "./src/component/alerts/FuelAlertMonitor";
import PushNotificationMonitor from "./src/component/alerts/PushNotificationMonitor";
import QueueTurnAlertMonitor from "./src/component/alerts/QueueTurnAlertMonitor";
import HomeScreen from "./src/component/screens/home/HomeScreen";
import ElectricHomeScreen from "./src/component/screens/home/ElectricHomeScreen";
import ElectricStationDetails from "./src/component/screens/home/ElectricStationDetails";
import StationDetails from "./src/component/screens/home/StationDetails";
import MapScreen from "./src/component/screens/map/MapScreen";
import LoginScreen from "./src/component/screens/auth/LoginScreen";
import RegisterScreen from "./src/component/screens/auth/RegisterScreen";
import ForgotPasswordScreen from "./src/component/screens/auth/ForgotPasswordScreen";
import PhoneVerifyScreen from "./src/component/screens/auth/PhoneVerifyScreen";
import ResetPasswordScreen from "./src/component/screens/auth/ResetPasswordScreen";
import StationDiscoveryChoiceScreen from "./src/component/screens/auth/StationDiscoveryChoiceScreen";
import AlertsScreen from "./src/component/screens/alerts/AlertsScreen";
import TransactionHistoryScreen from "./src/component/screens/profile/TransactionHistoryScreen";
import {
  changeMyPassword,
  registerBiometricLogin,
  resendEmailVerification,
  unregisterBiometricLogin,
  updateMyProfile,
} from "./src/component/services/authService";
import {
  loadSavedStations,
  loadVehicles,
  removeSavedStation,
  removeVehicle,
  saveSavedStations,
  saveVehicles,
  upsertVehicle,
} from "./src/component/services/accountStorage";
import {
  buildBiometricDeviceLabel,
  clearBiometricLoginCredential,
  getOrCreateBiometricDeviceId,
  saveBiometricLoginCredential,
  updateBiometricLoginMeta,
} from "./src/component/services/biometricService";
import {
  disableDevicePushTokenRegistrationAsync,
  ensureFuelAlertNotificationPermissionsAsync,
  FUEL_ALERT_PREF_KEYS,
  loadUnreadFuelAlertCount,
  resetFuelAlertState,
  syncDevicePushTokenRegistrationAsync,
  subscribeToFuelAlertHistory,
} from "./src/component/services/fuelAlertService";
import * as Location from "expo-location";
import * as LocalAuthentication from "expo-local-authentication";
import { AuthProvider, useAuth } from "./src/component/context/AuthContext";
import { OfflineProvider, useOffline } from "./src/component/context/OfflineContext";
import { LanguageProvider, useLanguage } from "./src/component/context/LanguageContext";
import { clearOfflineStorage } from "./src/component/services/offlineService";

const queryClient = new QueryClient();
const RootStack = createNativeStackNavigator();
const HomeStack = createNativeStackNavigator();
const ProfileStack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();
const BIOMETRIC_PREF_KEY = "ff_pref_biometric_unlock";

import * as Sentry from "@sentry/react-native";
// Unlike Sentry on other platforms, you do not need to import anything to use tracing on React Native
const sentryDsn = process.env.EXPO_PUBLIC_SENTRY_DSN || process.env.DSN || "";
Sentry.init({
  dsn: sentryDsn,
  // We recommend adjusting this value in production, or using tracesSampler
  // for finer control
  tracesSampleRate: 1.0,
});







function LoadingScreen() {
  const { t } = useLanguage();
  return (
    <View style={styles.loadingScreen}>
      <ActivityIndicator size="large" color="#0F766E" />
      <Text style={styles.loadingText}>{t("loadingSession")}</Text>
    </View>
  );
}

function OfflineStatusBanner() {
  const { t } = useLanguage();
  const { isOffline, isSyncing, pendingActionsCount } = useOffline();

  if (!isOffline && !isSyncing && !pendingActionsCount) {
    return null;
  }

  const bannerText = isSyncing
    ? t("offlineSyncingBanner", {
        defaultValue: pendingActionsCount
          ? `Syncing ${pendingActionsCount} saved change${pendingActionsCount === 1 ? "" : "s"}...`
          : "Syncing saved changes...",
      })
    : isOffline
      ? t("offlineBanner", {
          defaultValue: pendingActionsCount
            ? `Offline mode. ${pendingActionsCount} saved change${pendingActionsCount === 1 ? "" : "s"} waiting to sync.`
            : "Offline mode. Using saved data until connection returns.",
        })
      : t("offlinePendingBanner", {
          defaultValue: pendingActionsCount
            ? `${pendingActionsCount} saved change${pendingActionsCount === 1 ? "" : "s"} waiting to sync.`
            : "Saved changes waiting to sync.",
        });

  return (
    <View style={[styles.offlineBanner, isOffline ? styles.offlineBannerWarn : styles.offlineBannerSync]}>
      <Ionicons
        name={isSyncing ? "sync-outline" : isOffline ? "cloud-offline-outline" : "cloud-done-outline"}
        size={16}
        color={isOffline ? "#78350F" : "#164E63"}
      />
      <Text style={[styles.offlineBannerText, isOffline ? styles.offlineBannerTextWarn : styles.offlineBannerTextSync]}>
        {bannerText}
      </Text>
    </View>
  );
}

function createEmptyVehicleDraft(preferredFuel = "gasoline") {
  return {
    id: "",
    nickname: "",
    plateNumber: "",
    fuelType:
      preferredFuel === "diesel" || preferredFuel === "electric" ? preferredFuel : "gasoline",
    tankCapacityLiters: "",
    isPrimary: false,
  };
}

function getVehicleFuelLabel(t, fuelType) {
  if (fuelType === "diesel") return t("fuelDiesel");
  if (fuelType === "electric") return t("fuelElectric");
  return t("fuelGasoline");
}

async function getBiometricAvailability() {
  const [hasHardware, isEnrolled, authTypes] = await Promise.all([
    LocalAuthentication.hasHardwareAsync(),
    LocalAuthentication.isEnrolledAsync(),
    LocalAuthentication.supportedAuthenticationTypesAsync(),
  ]);

  return {
    hasHardware,
    isEnrolled,
    authTypes: Array.isArray(authTypes) ? authTypes : [],
  };
}

function getBiometricMethodLabel(t, authTypes) {
  if (authTypes.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
    return t("biometricMethodFace", { defaultValue: "Face ID" });
  }
  if (authTypes.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
    return t("biometricMethodFingerprint", { defaultValue: "fingerprint" });
  }
  if (authTypes.includes(LocalAuthentication.AuthenticationType.IRIS)) {
    return t("biometricMethodIris", { defaultValue: "iris" });
  }
  return t("biometricMethodGeneric", { defaultValue: "biometrics" });
}

async function requestBiometricAuthentication(t, authTypes, promptOverride) {
  return LocalAuthentication.authenticateAsync({
    promptMessage:
      promptOverride ||
      t("biometricPromptMessage", { defaultValue: "Confirm your identity" }),
    cancelLabel: t("cancel"),
    fallbackLabel: t("biometricFallbackLabel", { defaultValue: "Use passcode" }),
    disableDeviceFallback: false,
  });
}

function getBiometricSetupFailureMessage(t, error) {
  const backendMessage = String(error?.response?.data?.message || "").trim();
  if (backendMessage) return backendMessage;

  const rawMessage = String(error?.message || "").trim();
  const normalizedMessage = rawMessage.toLowerCase();

  if (normalizedMessage.includes("network") || normalizedMessage.includes("timeout")) {
    return t("biometricSetupNetworkError", {
      defaultValue:
        "FuelFinder could not reach the server to enable biometric login. Check your connection and try again.",
    });
  }

  if (
    normalizedMessage.includes("secure biometric storage failed") ||
    normalizedMessage.includes("secure storage") ||
    normalizedMessage.includes("keychain") ||
    normalizedMessage.includes("keystore")
  ) {
    return t("biometricSetupStorageError", {
      defaultValue:
        "FuelFinder could not save the biometric login key securely on this device. Make sure screen lock and biometrics are enabled. If you are testing in Expo Go, switch to a development build.",
    });
  }

  if (rawMessage) return rawMessage;
  return t("somethingWentWrong");
}

function formatTransactionMoney(value, currency = "ETB") {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "-";
  const normalizedCurrency = String(currency || "ETB").trim().toUpperCase() || "ETB";
  return `${amount.toFixed(2)} ${normalizedCurrency}`;
}

function formatTransactionDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  try {
    return date.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch (_error) {
    return date.toLocaleString();
  }
}

function formatTransactionLabel(value, fallback = "-") {
  const text = String(value || "").trim();
  if (!text) return fallback;
  return text.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function getTransactionTone(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (["authorized", "refunded", "served", "verified", "success", "not_required"].includes(normalized)) {
    return "success";
  }
  if (["pending", "pending_payment", "waiting", "called", "arrived", "initialized"].includes(normalized)) {
    return "warning";
  }
  if (["failed", "cancelled", "expired", "forfeited", "rejected"].includes(normalized)) {
    return "danger";
  }
  return "neutral";
}

function getTransactionFuelLabel(t, fuelType) {
  const normalized = String(fuelType || "").trim().toLowerCase();
  if (normalized === "diesel") return t("fuelDiesel");
  if (normalized === "other") return t("fuelOther", { defaultValue: "Other" });
  return t("fuelGasoline");
}

function ProfileScreen({ navigation }) {
  const {
    user,
    signOut,
    replaceUser,
    beginTwoFactorSetup,
    confirmTwoFactorOtp,
    resendTwoFactorCode,
    turnOffTwoFactor,
  } = useAuth();
  const { t, changeLanguage, language } = useLanguage();
  const qc = useQueryClient();

  const PREF_KEYS = React.useMemo(
    () => ({
      darkMode: "ff_pref_dark_mode",
      pushNotifs: FUEL_ALERT_PREF_KEYS.pushNotifications,
      nearbyFuelAlerts: FUEL_ALERT_PREF_KEYS.nearbyFuelAlerts,
      emailNotifs: "ff_pref_email_notifs",
      priceAlerts: "ff_pref_price_alerts",
      locationSharing: FUEL_ALERT_PREF_KEYS.locationSharing,
      biometricUnlock: BIOMETRIC_PREF_KEY,
      dataSaver: "ff_pref_data_saver",
      autoRefreshPrices: "ff_pref_auto_refresh_prices",
      units: "ff_pref_units",
      preferredFuel: FUEL_ALERT_PREF_KEYS.preferredFuel,
    }),
    []
  );

  const [prefs, setPrefs] = React.useState({
    darkMode: false,
    pushNotifs: true,
    nearbyFuelAlerts: true,
    emailNotifs: true,
    priceAlerts: true,
    locationSharing: true,
    biometricUnlock: false,
    dataSaver: false,
    autoRefreshPrices: true,
    units: "metric", // metric | imperial
    preferredFuel: "gasoline", // gasoline | diesel | electric
  });
  const [prefsReady, setPrefsReady] = React.useState(false);
  const [accountModal, setAccountModal] = React.useState("");
  const [accountBusy, setAccountBusy] = React.useState(false);
  const [vehicles, setVehicles] = React.useState([]);
  const [savedStations, setSavedStations] = React.useState([]);
  const [profileForm, setProfileForm] = React.useState({
    name: "",
    email: "",
    phone: "",
  });
  const [passwordForm, setPasswordForm] = React.useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [twoFactorToken, setTwoFactorToken] = React.useState("");
  const [twoFactorCode, setTwoFactorCode] = React.useState("");
  const [twoFactorCooldown, setTwoFactorCooldown] = React.useState(0);
  const [twoFactorResending, setTwoFactorResending] = React.useState(false);
  const [vehicleEditorVisible, setVehicleEditorVisible] = React.useState(false);
  const [vehicleDraft, setVehicleDraft] = React.useState(() => createEmptyVehicleDraft());

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
          nearbyFuelAlerts: readBool(PREF_KEYS.nearbyFuelAlerts, true),
          emailNotifs: readBool(PREF_KEYS.emailNotifs, true),
          priceAlerts: readBool(PREF_KEYS.priceAlerts, true),
          locationSharing: readBool(PREF_KEYS.locationSharing, true),
          biometricUnlock: readBool(PREF_KEYS.biometricUnlock, false),
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

  React.useEffect(() => {
    setProfileForm({
      name: user?.name || "",
      email: user?.email || "",
      phone: user?.phone || "",
    });
  }, [user?.email, user?.name, user?.phone]);

  const refreshAccountCollections = React.useCallback(async () => {
    try {
      const [nextVehicles, nextSavedStations] = await Promise.all([
        loadVehicles(),
        loadSavedStations(),
      ]);
      setVehicles(nextVehicles);
      setSavedStations(nextSavedStations);
    } catch (_error) {
      Alert.alert(t("somethingWentWrong"));
    }
  }, [t]);

  useFocusEffect(
    React.useCallback(() => {
      refreshAccountCollections();
      return undefined;
    }, [refreshAccountCollections])
  );

  React.useEffect(() => {
    if (twoFactorCooldown <= 0) return undefined;
    const intervalId = setInterval(() => {
      setTwoFactorCooldown((current) => (current > 1 ? current - 1 : 0));
    }, 1000);
    return () => clearInterval(intervalId);
  }, [twoFactorCooldown]);

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
        await resetFuelAlertState();
        await clearOfflineStorage();
        setPrefs({
          darkMode: false,
          pushNotifs: true,
          nearbyFuelAlerts: true,
          emailNotifs: true,
          priceAlerts: true,
          locationSharing: true,
          biometricUnlock: false,
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

  const enablePushNotificationsPreference = React.useCallback(async () => {
    try {
      const granted = await ensureFuelAlertNotificationPermissionsAsync();
      if (!granted) {
        Alert.alert(
          t("pushPermissionTitle", { defaultValue: "Push notifications needed" }),
          t("pushPermissionBody", {
            defaultValue:
              "Allow notifications so FuelFinder can alert you when your preferred fuel is available nearby.",
          }),
          [
            { text: t("cancel"), style: "cancel" },
            {
              text: t("openSettingsAction", { defaultValue: "Open settings" }),
              onPress: () => Linking.openSettings?.(),
            },
          ]
        );
        return false;
      }

      setPrefs((current) => ({ ...current, pushNotifs: true }));
      await persistBool(PREF_KEYS.pushNotifs, true);
      await syncDevicePushTokenRegistrationAsync({ allowPermissionPrompt: false });
      return true;
    } catch (_error) {
      Alert.alert(t("somethingWentWrong"));
      return false;
    }
  }, [PREF_KEYS.pushNotifs, persistBool, t]);

  const ensureLocationSharingEnabled = React.useCallback(async () => {
    if (prefs.locationSharing) return true;

    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted") {
        Alert.alert(
          t("locationPermissionTitle", { defaultValue: "Location permission needed" }),
          t("locationPermissionBody", {
            defaultValue: "Allow location access to keep nearby stations and routing accurate.",
          }),
          [
            { text: t("cancel"), style: "cancel" },
            {
              text: t("openSettingsAction", { defaultValue: "Open settings" }),
              onPress: () => Linking.openSettings?.(),
            },
          ]
        );
        return false;
      }

      setPrefs((current) => ({ ...current, locationSharing: true }));
      await persistBool(PREF_KEYS.locationSharing, true);
      return true;
    } catch (_error) {
      Alert.alert(t("somethingWentWrong"));
      return false;
    }
  }, [PREF_KEYS.locationSharing, persistBool, prefs.locationSharing, t]);

  const handlePushNotificationsToggle = React.useCallback(async () => {
    if (prefs.pushNotifs) {
      setPrefs((current) => ({
        ...current,
        pushNotifs: false,
        nearbyFuelAlerts: false,
      }));
      await persistBool(PREF_KEYS.pushNotifs, false);
      await persistBool(PREF_KEYS.nearbyFuelAlerts, false);
      await disableDevicePushTokenRegistrationAsync();
      return;
    }

    await enablePushNotificationsPreference();
  }, [
    PREF_KEYS.nearbyFuelAlerts,
    PREF_KEYS.pushNotifs,
    enablePushNotificationsPreference,
    persistBool,
    prefs.pushNotifs,
  ]);

  const handleLocationSharingToggle = React.useCallback(async () => {
    const nextValue = !prefs.locationSharing;
    if (!nextValue) {
      setPrefs((current) => ({ ...current, locationSharing: false }));
      await persistBool(PREF_KEYS.locationSharing, false);
      return;
    }

    await ensureLocationSharingEnabled();
  }, [
    PREF_KEYS.locationSharing,
    ensureLocationSharingEnabled,
    persistBool,
    prefs.locationSharing,
  ]);

  const handleNearbyFuelAlertsToggle = React.useCallback(async () => {
    if (prefs.nearbyFuelAlerts) {
      setPrefs((current) => ({ ...current, nearbyFuelAlerts: false }));
      await persistBool(PREF_KEYS.nearbyFuelAlerts, false);
      return;
    }

    const pushReady = await enablePushNotificationsPreference();
    if (!pushReady) return;

    const locationReady = await ensureLocationSharingEnabled();
    if (!locationReady) return;

    setPrefs((current) => ({ ...current, nearbyFuelAlerts: true }));
    await persistBool(PREF_KEYS.nearbyFuelAlerts, true);
  }, [
    PREF_KEYS.nearbyFuelAlerts,
    enablePushNotificationsPreference,
    ensureLocationSharingEnabled,
    persistBool,
    prefs.nearbyFuelAlerts,
  ]);

  const handleBiometricToggle = React.useCallback(async () => {
    if (prefs.biometricUnlock) {
      try {
        const deviceId = await getOrCreateBiometricDeviceId();
        await unregisterBiometricLogin({
          deviceId,
          deviceLabel: buildBiometricDeviceLabel(),
        });
      } catch (_error) {
        // If backend cleanup fails we still clear the local device credential.
      }
      await clearBiometricLoginCredential();
      setPrefs((current) => ({ ...current, biometricUnlock: false }));
      await persistBool(PREF_KEYS.biometricUnlock, false);
      Alert.alert(
        t("done"),
        t("biometricDisabledMessage", {
          defaultValue: "Biometric unlock and biometric login have been turned off for this device.",
        })
      );
      return;
    }

    try {
      const availability = await getBiometricAvailability();
      if (!availability.hasHardware) {
        Alert.alert(
          t("biometricUnavailableTitle", { defaultValue: "Biometric unlock unavailable" }),
          t("biometricUnavailableBody", {
            defaultValue: "This device does not support fingerprint, face, or iris authentication.",
          })
        );
        return;
      }

      if (!availability.isEnrolled) {
        Alert.alert(
          t("biometricEnrollTitle", { defaultValue: "Set up biometrics first" }),
          t("biometricEnrollBody", {
            defaultValue: "Add a fingerprint, face scan, or device passcode in system settings before enabling biometric unlock.",
          }),
          [
            { text: t("cancel"), style: "cancel" },
            {
              text: t("openSettingsAction", { defaultValue: "Open settings" }),
              onPress: () => Linking.openSettings?.(),
            },
          ]
        );
        return;
      }

      const methodLabel = getBiometricMethodLabel(t, availability.authTypes);
      const result = await requestBiometricAuthentication(
        t,
        availability.authTypes,
        t("biometricEnablePrompt", {
          defaultValue: `Use ${methodLabel} to enable biometric unlock`,
        })
      );

      if (!result.success) {
        if (
          result.error === "user_cancel" ||
          result.error === "system_cancel" ||
          result.error === "app_cancel"
        ) {
          return;
        }

        Alert.alert(
          t("biometricFailedTitle", { defaultValue: "Biometric check failed" }),
          t("biometricFailedBody", {
            defaultValue: "We could not confirm your identity. Please try again.",
          })
        );
        return;
      }

      const deviceId = await getOrCreateBiometricDeviceId();
      const deviceLabel = buildBiometricDeviceLabel();
      const registration = await registerBiometricLogin({
        deviceId,
        deviceLabel,
      });
      const registeredDeviceId = registration?.deviceId || deviceId;

      try {
        await saveBiometricLoginCredential({
          deviceId: registeredDeviceId,
          biometricSecret: registration?.biometricSecret || "",
          email: user?.email || "",
          displayName: user?.name || "",
        });
      } catch (storageError) {
        try {
          await unregisterBiometricLogin({
            deviceId: registeredDeviceId,
            deviceLabel,
          });
        } catch (_rollbackError) {
          // Ignore rollback failures and surface the original storage error.
        }
        throw storageError;
      }

      setPrefs((current) => ({ ...current, biometricUnlock: true }));
      await persistBool(PREF_KEYS.biometricUnlock, true);
      Alert.alert(
        t("done"),
        t("biometricEnabledMessage", {
          defaultValue: "Biometric unlock and biometric sign-in are now enabled for this device.",
        })
      );
    } catch (error) {
      Alert.alert(
        t("biometricFailedTitle", { defaultValue: "Biometric setup failed" }),
        getBiometricSetupFailureMessage(t, error)
      );
    }
  }, [PREF_KEYS.biometricUnlock, persistBool, prefs.biometricUnlock, t, user?.email, user?.name]);

  const resetVehicleEditor = React.useCallback(() => {
    setVehicleEditorVisible(false);
    setVehicleDraft(createEmptyVehicleDraft(prefs.preferredFuel));
  }, [prefs.preferredFuel]);

  const closeAccountModal = React.useCallback(() => {
    setAccountModal("");
    setAccountBusy(false);
    setTwoFactorToken("");
    setTwoFactorCode("");
    setTwoFactorCooldown(0);
    setTwoFactorResending(false);
    setProfileForm({
      name: user?.name || "",
      email: user?.email || "",
      phone: user?.phone || "",
    });
    setPasswordForm({
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    });
    resetVehicleEditor();
  }, [resetVehicleEditor, user?.email, user?.name, user?.phone]);

  const verifyTwoFactorSetup = React.useCallback(async () => {
    if (!twoFactorCode.trim()) {
      Alert.alert(
        t("twoFactorCodeTitle", { defaultValue: "Security code required" }),
        t("twoFactorCodeBody", { defaultValue: "Enter the 6-digit security code to continue." })
      );
      return;
    }

    setAccountBusy(true);
    try {
      const data = await confirmTwoFactorOtp({
        verificationToken: twoFactorToken,
        otpCode: twoFactorCode.trim(),
      });
      Alert.alert(
        t("done"),
        data?.message || t("twoFactorEnabledMessage", { defaultValue: "Two-factor authentication enabled." })
      );
      closeAccountModal();
    } catch (error) {
      Alert.alert(
        t("twoFactorVerifyFailed", { defaultValue: "Could not verify security code" }),
        error?.response?.data?.message || t("somethingWentWrong")
      );
    } finally {
      setAccountBusy(false);
    }
  }, [closeAccountModal, confirmTwoFactorOtp, t, twoFactorCode, twoFactorToken]);

  const resendTwoFactorSetup = React.useCallback(async () => {
    if (!twoFactorToken) return;
    setTwoFactorResending(true);
    try {
      const data = await resendTwoFactorCode({ verificationToken: twoFactorToken });
      if (data?.verificationToken) {
        setTwoFactorToken(data.verificationToken);
      }
      setTwoFactorCooldown(Number(data?.resendCooldownSeconds || 0));
    } catch (error) {
      Alert.alert(
        t("twoFactorResendFailed", { defaultValue: "Could not resend code" }),
        error?.response?.data?.message || t("somethingWentWrong")
      );
    } finally {
      setTwoFactorResending(false);
    }
  }, [resendTwoFactorCode, t, twoFactorToken]);

  const handleTwoFactorToggle = React.useCallback(async () => {
    if (Boolean(user?.twoFactorEnabled)) {
      confirmAction(
        t("disableTwoFactorTitle", { defaultValue: "Disable two-factor authentication" }),
        t("disableTwoFactorBody", {
          defaultValue: "Your account will stop requiring SMS verification on secure sign-in.",
        }),
        async () => {
          setAccountBusy(true);
          try {
            const data = await turnOffTwoFactor();
            Alert.alert(
              t("done"),
              data?.message || t("twoFactorDisabledMessage", { defaultValue: "Two-factor authentication disabled." })
            );
          } catch (error) {
            Alert.alert(
              t("twoFactorDisableFailed", { defaultValue: "Could not disable two-factor authentication" }),
              error?.response?.data?.message || t("somethingWentWrong")
            );
          } finally {
            setAccountBusy(false);
          }
        }
      );
      return;
    }

    if (!user?.phone) {
      Alert.alert(
        t("twoFactorPhoneRequiredTitle", { defaultValue: "Phone number required" }),
        t("twoFactorPhoneRequiredBody", {
          defaultValue: "Add a phone number in Edit profile before enabling two-factor authentication.",
        })
      );
      return;
    }

    if (!user?.phoneVerified) {
      Alert.alert(
        t("twoFactorPhoneVerifiedTitle", { defaultValue: "Verify your phone first" }),
        t("twoFactorPhoneVerifiedBody", {
          defaultValue: "Two-factor authentication requires a verified phone number.",
        })
      );
      return;
    }

    setAccountBusy(true);
    try {
      const data = await beginTwoFactorSetup();
      setTwoFactorToken(data?.verificationToken || "");
      setTwoFactorCode("");
      setTwoFactorCooldown(Number(data?.resendCooldownSeconds || 0));
      setAccountModal("twoFactor");
    } catch (error) {
      Alert.alert(
        t("twoFactorStartFailed", { defaultValue: "Could not start two-factor setup" }),
        error?.response?.data?.message || t("somethingWentWrong")
      );
    } finally {
      setAccountBusy(false);
    }
  }, [beginTwoFactorSetup, confirmAction, t, turnOffTwoFactor, user?.phone, user?.phoneVerified, user?.twoFactorEnabled]);

  const openAccountModal = React.useCallback(
    async (modalName) => {
      setAccountModal(modalName);
      if (modalName === "editProfile") {
        setProfileForm({
          name: user?.name || "",
          email: user?.email || "",
          phone: user?.phone || "",
        });
      }
      if (modalName === "changePassword") {
        setPasswordForm({
          currentPassword: "",
          newPassword: "",
          confirmPassword: "",
        });
      }
      if (modalName === "vehicles") {
        resetVehicleEditor();
      }
      if (modalName === "vehicles" || modalName === "savedStations") {
        await refreshAccountCollections();
      }
    },
    [refreshAccountCollections, resetVehicleEditor, user?.email, user?.name, user?.phone]
  );

  const saveProfileChanges = React.useCallback(async () => {
    const payload = {
      name: String(profileForm.name || "").trim(),
      email: String(profileForm.email || "").trim().toLowerCase(),
      phone: String(profileForm.phone || "").trim(),
    };

    if (!payload.name || !payload.email) {
      Alert.alert(
        t("profileAccountValidationTitle", { defaultValue: "Missing details" }),
        t("profileAccountValidationBody", { defaultValue: "Name and email are required." })
      );
      return;
    }

    setAccountBusy(true);
    try {
      const data = await updateMyProfile(payload);
      const nextUser = data?.offlineQueued
        ? {
            ...user,
            name: payload.name,
            phone: payload.phone,
          }
        : data?.user;
      if (nextUser) {
        await replaceUser(nextUser);
      }
      if (prefs.biometricUnlock) {
        await updateBiometricLoginMeta({
          email: nextUser?.email || payload.email,
          displayName: nextUser?.name || payload.name,
        });
      }
      Alert.alert(
        t("done"),
        data?.message ||
          t("profileUpdated", { defaultValue: "Profile updated successfully." })
      );
      closeAccountModal();
    } catch (error) {
      Alert.alert(
        t("updateFailed", { defaultValue: "Update failed" }),
        error?.response?.data?.message || t("somethingWentWrong")
      );
    } finally {
      setAccountBusy(false);
    }
  }, [closeAccountModal, prefs.biometricUnlock, profileForm.email, profileForm.name, profileForm.phone, replaceUser, t, user]);

  const resendEmailVerificationLink = React.useCallback(async () => {
    setAccountBusy(true);
    try {
      const data = await resendEmailVerification();
      if (data?.user) {
        await replaceUser(data.user);
      }
      Alert.alert(
        t("done"),
        data?.message ||
          t("emailVerificationSentBody", {
            defaultValue: "Verification email sent. Check your inbox and spam folder.",
          })
      );
    } catch (error) {
      Alert.alert(
        t("updateFailed", { defaultValue: "Update failed" }),
        error?.response?.data?.message || t("somethingWentWrong")
      );
    } finally {
      setAccountBusy(false);
    }
  }, [replaceUser, t]);

  const savePasswordChanges = React.useCallback(async () => {
    const currentPassword = String(passwordForm.currentPassword || "");
    const newPassword = String(passwordForm.newPassword || "");
    const confirmPassword = String(passwordForm.confirmPassword || "");
    const isGoogleAccount = String(user?.authProvider || "local") === "google";

    if (!newPassword) {
      Alert.alert(
        t("passwordRequiredTitle", { defaultValue: "Password required" }),
        t("passwordRequiredBody", { defaultValue: "Enter your new password to continue." })
      );
      return;
    }

    if (newPassword !== confirmPassword) {
      Alert.alert(
        t("passwordMismatchTitle", { defaultValue: "Passwords do not match" }),
        t("passwordMismatchBody", {
          defaultValue: "Your new password and confirmation must match.",
        })
      );
      return;
    }

    if (!isGoogleAccount && !currentPassword) {
      Alert.alert(
        t("currentPasswordRequiredTitle", { defaultValue: "Current password required" }),
        t("currentPasswordRequiredBody", {
          defaultValue: "Enter your current password to continue.",
        })
      );
      return;
    }

    setAccountBusy(true);
    try {
      const data = await changeMyPassword({
        currentPassword,
        newPassword,
      });
      Alert.alert(
        t("done"),
        data?.message || t("passwordUpdated", { defaultValue: "Password changed successfully." })
      );
      closeAccountModal();
    } catch (error) {
      Alert.alert(
        t("changePasswordFailed", { defaultValue: "Could not change password" }),
        error?.response?.data?.message || t("somethingWentWrong")
      );
    } finally {
      setAccountBusy(false);
    }
  }, [
    closeAccountModal,
    passwordForm.confirmPassword,
    passwordForm.currentPassword,
    passwordForm.newPassword,
    t,
    user?.authProvider,
  ]);

  const startVehicleCreate = React.useCallback(() => {
    setVehicleDraft(createEmptyVehicleDraft(prefs.preferredFuel));
    setVehicleEditorVisible(true);
  }, [prefs.preferredFuel]);

  const startVehicleEdit = React.useCallback((vehicle) => {
    setVehicleDraft({
      id: vehicle.id,
      nickname: vehicle.nickname || "",
      plateNumber: vehicle.plateNumber || "",
      fuelType: vehicle.fuelType || "gasoline",
      tankCapacityLiters: vehicle.tankCapacityLiters ? String(vehicle.tankCapacityLiters) : "",
      isPrimary: Boolean(vehicle.isPrimary),
    });
    setVehicleEditorVisible(true);
  }, []);

  const saveVehicleChanges = React.useCallback(async () => {
    const nickname = String(vehicleDraft.nickname || "").trim();
    const plateNumber = String(vehicleDraft.plateNumber || "").trim().toUpperCase();
    const rawCapacity = String(vehicleDraft.tankCapacityLiters || "").trim();
    const tankCapacityLiters = rawCapacity ? Number(rawCapacity) : 0;

    if (!nickname && !plateNumber) {
      Alert.alert(
        t("vehicleNameRequiredTitle", { defaultValue: "Vehicle details required" }),
        t("vehicleNameRequiredBody", {
          defaultValue: "Add a vehicle nickname or plate number.",
        })
      );
      return;
    }

    if (rawCapacity && (!Number.isFinite(tankCapacityLiters) || tankCapacityLiters <= 0)) {
      Alert.alert(
        t("vehicleCapacityTitle", { defaultValue: "Invalid tank capacity" }),
        t("vehicleCapacityBody", {
          defaultValue: "Enter a valid tank capacity in liters.",
        })
      );
      return;
    }

    setAccountBusy(true);
    try {
      const nextVehicles = await upsertVehicle({
        id: vehicleDraft.id,
        nickname,
        plateNumber,
        fuelType: vehicleDraft.fuelType,
        tankCapacityLiters,
        isPrimary: vehicleDraft.isPrimary,
      });
      setVehicles(nextVehicles);
      resetVehicleEditor();
    } catch (_error) {
      Alert.alert(t("somethingWentWrong"));
    } finally {
      setAccountBusy(false);
    }
  }, [
    resetVehicleEditor,
    t,
    vehicleDraft.fuelType,
    vehicleDraft.id,
    vehicleDraft.isPrimary,
    vehicleDraft.nickname,
    vehicleDraft.plateNumber,
    vehicleDraft.tankCapacityLiters,
  ]);

  const deleteVehicleItem = React.useCallback((vehicleId) => {
    confirmAction(
      t("removeVehicle", { defaultValue: "Remove vehicle" }),
      t("removeVehicleBody", {
        defaultValue: "This vehicle will be removed from this device.",
      }),
      async () => {
        setAccountBusy(true);
        try {
          const nextVehicles = await removeVehicle(vehicleId);
          setVehicles(nextVehicles);
          if (vehicleDraft.id === vehicleId) {
            resetVehicleEditor();
          }
        } catch (_error) {
          Alert.alert(t("somethingWentWrong"));
        } finally {
          setAccountBusy(false);
        }
      }
    );
  }, [confirmAction, resetVehicleEditor, t, vehicleDraft.id]);

  const makePrimaryVehicle = React.useCallback(async (vehicleId) => {
    setAccountBusy(true);
    try {
      const nextVehicles = await saveVehicles(
        vehicles.map((vehicle) => ({
          ...vehicle,
          isPrimary: vehicle.id === vehicleId,
        }))
      );
      setVehicles(nextVehicles);
    } catch (_error) {
      Alert.alert(t("somethingWentWrong"));
    } finally {
      setAccountBusy(false);
    }
  }, [t, vehicles]);

  const removeSavedStationItem = React.useCallback((stationId) => {
    confirmAction(
      t("removeSavedStation", { defaultValue: "Remove saved station" }),
      t("removeSavedStationBody", {
        defaultValue: "This station will be removed from your saved list.",
      }),
      async () => {
        setAccountBusy(true);
        try {
          const nextSavedStations = await removeSavedStation(stationId);
          setSavedStations(nextSavedStations);
        } catch (_error) {
          Alert.alert(t("somethingWentWrong"));
        } finally {
          setAccountBusy(false);
        }
      }
    );
  }, [confirmAction, t]);

  const openSavedStationRoute = React.useCallback((station) => {
    const latitude = Number(station?.latitude);
    const longitude = Number(station?.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      Alert.alert(
        t("routeUnavailableTitle", { defaultValue: "Route unavailable" }),
        t("routeUnavailableBody", {
          defaultValue: "This station does not have valid map coordinates yet.",
        })
      );
      return;
    }

    closeAccountModal();
    navigation.navigate("Map", {
      routeRequest: {
        requestedAt: Date.now(),
        station: {
          ...station,
          latitude,
          longitude,
        },
      },
    });
  }, [closeAccountModal, navigation, t]);

  const callSavedStation = React.useCallback((station) => {
    if (!station?.contact) {
      Alert.alert(
        t("contactUnavailableTitle", { defaultValue: "Contact unavailable" }),
        t("contactUnavailableBody", {
          defaultValue: "This station has not published a contact number yet.",
        })
      );
      return;
    }

    openUrl(`tel:${station.contact}`);
  }, [openUrl, t]);

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
  const pendingEmail = String(user?.pendingEmail || "").trim();
  const emailStatusText = pendingEmail
    ? t("pendingEmailStatus", {
        defaultValue: `Pending email change: ${pendingEmail}`,
      })
    : user?.emailVerified
      ? t("emailVerifiedStatus", { defaultValue: "Email verified" })
      : t("emailUnverifiedStatus", { defaultValue: "Email not verified yet" });
  const avatarLetter = (user?.name || user?.email || "?").trim().slice(0, 1).toUpperCase();
  const isGoogleAccount = String(user?.authProvider || "local") === "google";
  const modalMeta = {
    editProfile: {
      title: t("editProfile"),
      subtitle: t("editProfileSheetSubtitle", {
        defaultValue: "Keep your name, email, and phone number current.",
      }),
    },
    changePassword: {
      title: t("changePassword"),
      subtitle: t("changePasswordSheetSubtitle", {
        defaultValue: "Protect your account with a strong password.",
      }),
    },
    vehicles: {
      title: t("myVehicles"),
      subtitle: t("myVehiclesSheetSubtitle", {
        defaultValue: "Store the vehicles you drive most often.",
      }),
    },
    twoFactor: {
      title: t("twoFactorAuth"),
      subtitle: t("twoFactorSheetSubtitle", {
        defaultValue: "Enter the SMS security code to finish enabling two-factor protection.",
      }),
    },
    savedStations: {
      title: t("savedStations"),
      subtitle: t("savedStationsSheetSubtitle", {
        defaultValue: "Review your saved stations and jump back to them quickly.",
      }),
    },
  };

  const renderAccountModalContent = () => {
    if (accountModal === "editProfile") {
      return (
        <View style={styles.modalContent}>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>{t("name")}</Text>
            <TextInput
              value={profileForm.name}
              onChangeText={(value) => setProfileForm((current) => ({ ...current, name: value }))}
              style={styles.textInput}
              placeholder={t("name")}
              placeholderTextColor="#94A3B8"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>{t("email")}</Text>
            <TextInput
              value={profileForm.email}
              onChangeText={(value) => setProfileForm((current) => ({ ...current, email: value }))}
              style={[styles.textInput, isGoogleAccount && styles.textInputDisabled]}
              placeholder={t("email")}
              placeholderTextColor="#94A3B8"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              editable={!isGoogleAccount}
            />
            {isGoogleAccount ? (
              <Text style={styles.inputHelper}>
                {t("googleEmailLocked", {
                  defaultValue: "Google sign-in accounts keep their email synced from Google.",
                })}
              </Text>
            ) : null}
            {!isGoogleAccount && (pendingEmail || !user?.emailVerified) ? (
              <View style={styles.editorCard}>
                <Text style={styles.inputHelper}>
                  {pendingEmail
                    ? t("pendingEmailHelper", {
                        defaultValue: `Your current email stays active until ${pendingEmail} is verified from the inbox link.`,
                      })
                    : t("unverifiedEmailHelper", {
                        defaultValue: "This email is not verified yet. Open the inbox link to confirm ownership.",
                      })}
                </Text>
                <Pressable
                  style={[styles.modalGhostButton, accountBusy && styles.modalButtonDisabled]}
                  onPress={resendEmailVerificationLink}
                  disabled={accountBusy}
                >
                  {accountBusy ? (
                    <ActivityIndicator size="small" color="#0F766E" />
                  ) : (
                    <>
                      <Ionicons name="mail-outline" size={16} color="#0F766E" />
                      <Text style={styles.modalGhostButtonText}>
                        {t("resendEmailVerificationCta", { defaultValue: "Resend verification email" })}
                      </Text>
                    </>
                  )}
                </Pressable>
              </View>
            ) : null}
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>{t("profilePhoneLabel", { defaultValue: "Phone" })}</Text>
            <TextInput
              value={profileForm.phone}
              onChangeText={(value) => setProfileForm((current) => ({ ...current, phone: value }))}
              style={styles.textInput}
              placeholder={t("profilePhonePlaceholder", { defaultValue: "+251..." })}
              placeholderTextColor="#94A3B8"
              keyboardType="phone-pad"
            />
            <Text style={styles.inputHelper}>
              {t("profilePhoneHelper", {
                defaultValue: "Updating your phone will require verification before customer actions that depend on it.",
              })}
            </Text>
          </View>

          <View style={styles.modalActionRow}>
            <Pressable style={styles.modalSecondaryButton} onPress={closeAccountModal}>
              <Text style={styles.modalSecondaryButtonText}>{t("cancel")}</Text>
            </Pressable>
            <Pressable
              style={[styles.modalPrimaryButton, accountBusy && styles.modalButtonDisabled]}
              onPress={saveProfileChanges}
              disabled={accountBusy}
            >
              {accountBusy ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.modalPrimaryButtonText}>
                  {t("saveProfileCta", { defaultValue: "Save changes" })}
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      );
    }

    if (accountModal === "changePassword") {
      return (
        <View style={styles.modalContent}>
          <Text style={styles.modalHelperText}>{t("auth.register.passwordHint")}</Text>
          {isGoogleAccount ? (
            <Text style={styles.modalHelperText}>
              {t("googlePasswordHelper", {
                defaultValue: "Because you sign in with Google, your current password is optional when adding a local password.",
              })}
            </Text>
          ) : null}

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>
              {t("currentPasswordLabel", {
                defaultValue: isGoogleAccount ? "Current password (optional)" : "Current password",
              })}
            </Text>
            <TextInput
              value={passwordForm.currentPassword}
              onChangeText={(value) => setPasswordForm((current) => ({ ...current, currentPassword: value }))}
              style={styles.textInput}
              placeholder={t("currentPasswordPlaceholder", { defaultValue: "Enter current password" })}
              placeholderTextColor="#94A3B8"
              secureTextEntry
              autoCapitalize="none"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>{t("newPasswordLabel", { defaultValue: "New password" })}</Text>
            <TextInput
              value={passwordForm.newPassword}
              onChangeText={(value) => setPasswordForm((current) => ({ ...current, newPassword: value }))}
              style={styles.textInput}
              placeholder={t("newPasswordPlaceholder", { defaultValue: "Create a strong password" })}
              placeholderTextColor="#94A3B8"
              secureTextEntry
              autoCapitalize="none"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>{t("confirmPasswordLabel", { defaultValue: "Confirm password" })}</Text>
            <TextInput
              value={passwordForm.confirmPassword}
              onChangeText={(value) => setPasswordForm((current) => ({ ...current, confirmPassword: value }))}
              style={styles.textInput}
              placeholder={t("confirmPasswordPlaceholder", { defaultValue: "Repeat your new password" })}
              placeholderTextColor="#94A3B8"
              secureTextEntry
              autoCapitalize="none"
            />
          </View>

          <View style={styles.modalActionRow}>
            <Pressable style={styles.modalSecondaryButton} onPress={closeAccountModal}>
              <Text style={styles.modalSecondaryButtonText}>{t("cancel")}</Text>
            </Pressable>
            <Pressable
              style={[styles.modalPrimaryButton, accountBusy && styles.modalButtonDisabled]}
              onPress={savePasswordChanges}
              disabled={accountBusy}
            >
              {accountBusy ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.modalPrimaryButtonText}>
                  {t("changePasswordCta", { defaultValue: "Update password" })}
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      );
    }

    if (accountModal === "vehicles") {
      return (
        <View style={styles.modalContent}>
          <View style={styles.inlineActionHeader}>
            <Text style={styles.inlineActionCount}>
              {vehicles.length} {t("vehiclesCountLabel", { defaultValue: "vehicles saved" })}
            </Text>
            <Pressable style={styles.modalGhostButton} onPress={startVehicleCreate}>
              <Ionicons name="add" size={16} color="#0F766E" />
              <Text style={styles.modalGhostButtonText}>
                {t("addVehicleCta", { defaultValue: "Add vehicle" })}
              </Text>
            </Pressable>
          </View>

          {vehicleEditorVisible ? (
            <View style={styles.editorCard}>
              <Text style={styles.editorTitle}>
                {vehicleDraft.id
                  ? t("editVehicleTitle", { defaultValue: "Edit vehicle" })
                  : t("newVehicleTitle", { defaultValue: "New vehicle" })}
              </Text>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>{t("vehicleNicknameLabel", { defaultValue: "Vehicle name" })}</Text>
                <TextInput
                  value={vehicleDraft.nickname}
                  onChangeText={(value) => setVehicleDraft((current) => ({ ...current, nickname: value }))}
                  style={styles.textInput}
                  placeholder={t("vehicleNicknamePlaceholder", { defaultValue: "Family SUV, Work pickup..." })}
                  placeholderTextColor="#94A3B8"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>{t("vehiclePlateLabel", { defaultValue: "Plate number" })}</Text>
                <TextInput
                  value={vehicleDraft.plateNumber}
                  onChangeText={(value) => setVehicleDraft((current) => ({ ...current, plateNumber: value }))}
                  style={styles.textInput}
                  placeholder={t("vehiclePlatePlaceholder", { defaultValue: "ABC-1234" })}
                  placeholderTextColor="#94A3B8"
                  autoCapitalize="characters"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>{t("preferredFuel")}</Text>
                <View style={styles.chipRowCompact}>
                  {["gasoline", "diesel", "electric"].map((fuelType) => (
                    <Pressable
                      key={fuelType}
                      style={[styles.chip, vehicleDraft.fuelType === fuelType && styles.chipActive]}
                      onPress={() => setVehicleDraft((current) => ({ ...current, fuelType }))}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          vehicleDraft.fuelType === fuelType && styles.chipTextActive,
                        ]}
                      >
                        {getVehicleFuelLabel(t, fuelType)}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>
                  {t("vehicleCapacityLabel", { defaultValue: "Tank capacity (liters)" })}
                </Text>
                <TextInput
                  value={vehicleDraft.tankCapacityLiters}
                  onChangeText={(value) => setVehicleDraft((current) => ({ ...current, tankCapacityLiters: value }))}
                  style={styles.textInput}
                  placeholder={t("vehicleCapacityPlaceholder", { defaultValue: "55" })}
                  placeholderTextColor="#94A3B8"
                  keyboardType="numeric"
                />
              </View>

              <View style={styles.switchRow}>
                <View style={styles.switchTextWrap}>
                  <Text style={styles.switchTitle}>
                    {t("vehiclePrimaryLabel", { defaultValue: "Set as primary vehicle" })}
                  </Text>
                  <Text style={styles.switchSubtitle}>
                    {t("vehiclePrimaryBody", {
                      defaultValue: "Use this vehicle as your default choice in the app.",
                    })}
                  </Text>
                </View>
                <Switch
                  value={vehicleDraft.isPrimary}
                  onValueChange={(value) => setVehicleDraft((current) => ({ ...current, isPrimary: value }))}
                />
              </View>

              <View style={styles.modalActionRow}>
                <Pressable style={styles.modalSecondaryButton} onPress={resetVehicleEditor}>
                  <Text style={styles.modalSecondaryButtonText}>{t("cancel")}</Text>
                </Pressable>
                <Pressable
                  style={[styles.modalPrimaryButton, accountBusy && styles.modalButtonDisabled]}
                  onPress={saveVehicleChanges}
                  disabled={accountBusy}
                >
                  {accountBusy ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.modalPrimaryButtonText}>
                      {t("saveVehicleCta", { defaultValue: "Save vehicle" })}
                    </Text>
                  )}
                </Pressable>
              </View>
            </View>
          ) : null}

          {!vehicles.length ? (
            <View style={styles.emptyStateCard}>
              <Ionicons name="car-sport-outline" size={24} color="#0F766E" />
              <Text style={styles.emptyStateTitle}>
                {t("vehiclesEmptyTitle", { defaultValue: "No vehicles saved yet" })}
              </Text>
              <Text style={styles.emptyStateSubtitle}>
                {t("vehiclesEmptyBody", {
                  defaultValue: "Add your everyday vehicles to personalize fuel planning and future reservations.",
                })}
              </Text>
            </View>
          ) : null}

          {vehicles.map((vehicle) => (
            <View key={vehicle.id} style={styles.vehicleCard}>
              <View style={styles.vehicleHeader}>
                <View style={styles.vehicleHeaderText}>
                  <Text style={styles.vehicleTitle}>
                    {vehicle.nickname || vehicle.plateNumber || t("myVehicles")}
                  </Text>
                  <Text style={styles.vehicleMeta}>
                    {getVehicleFuelLabel(t, vehicle.fuelType)}
                    {vehicle.plateNumber ? ` | ${vehicle.plateNumber}` : ""}
                    {vehicle.tankCapacityLiters ? ` | ${vehicle.tankCapacityLiters}L` : ""}
                  </Text>
                </View>
                {vehicle.isPrimary ? (
                  <View style={styles.primaryBadge}>
                    <Text style={styles.primaryBadgeText}>
                      {t("primaryVehicleBadge", { defaultValue: "Primary" })}
                    </Text>
                  </View>
                ) : null}
              </View>

              <View style={styles.cardActionRow}>
                {!vehicle.isPrimary ? (
                  <Pressable style={styles.inlineLinkButton} onPress={() => makePrimaryVehicle(vehicle.id)}>
                    <Text style={styles.inlineLinkButtonText}>
                      {t("setPrimaryVehicleCta", { defaultValue: "Set primary" })}
                    </Text>
                  </Pressable>
                ) : null}
                <Pressable style={styles.inlineLinkButton} onPress={() => startVehicleEdit(vehicle)}>
                  <Text style={styles.inlineLinkButtonText}>
                    {t("editActionLabel", { defaultValue: "Edit" })}
                  </Text>
                </Pressable>
                <Pressable style={styles.inlineLinkButtonDanger} onPress={() => deleteVehicleItem(vehicle.id)}>
                  <Text style={styles.inlineLinkButtonDangerText}>
                    {t("removeVehicleCta", { defaultValue: "Remove" })}
                  </Text>
                </Pressable>
              </View>
            </View>
          ))}
        </View>
      );
    }

    if (accountModal === "twoFactor") {
      return (
        <View style={styles.modalContent}>
          <Text style={styles.modalHelperText}>
            {t("twoFactorSetupHelper", {
              defaultValue: "We sent a 6-digit security code to your verified phone number.",
            })}
          </Text>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>
              {t("twoFactorCodeLabel", { defaultValue: "Security code" })}
            </Text>
            <TextInput
              value={twoFactorCode}
              onChangeText={setTwoFactorCode}
              style={styles.textInput}
              placeholder={t("twoFactorCodePlaceholder", { defaultValue: "123456" })}
              placeholderTextColor="#94A3B8"
              keyboardType="number-pad"
              maxLength={6}
            />
          </View>

          <View style={styles.modalActionRow}>
            <Pressable style={styles.modalSecondaryButton} onPress={closeAccountModal}>
              <Text style={styles.modalSecondaryButtonText}>{t("cancel")}</Text>
            </Pressable>
            <Pressable
              style={[styles.modalPrimaryButton, accountBusy && styles.modalButtonDisabled]}
              onPress={verifyTwoFactorSetup}
              disabled={accountBusy}
            >
              {accountBusy ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.modalPrimaryButtonText}>
                  {t("verifySecurityCodeCta", { defaultValue: "Verify code" })}
                </Text>
              )}
            </Pressable>
          </View>

          <Pressable
            style={styles.inlineLinkButton}
            onPress={resendTwoFactorSetup}
            disabled={twoFactorResending || twoFactorCooldown > 0}
          >
            {twoFactorResending ? (
              <ActivityIndicator size="small" color="#1D4ED8" />
            ) : (
              <Text style={styles.inlineLinkButtonText}>
                {twoFactorCooldown > 0
                  ? t("twoFactorResendCountdown", {
                      defaultValue: `Resend in ${twoFactorCooldown}s`,
                    })
                  : t("twoFactorResendCta", { defaultValue: "Resend code" })}
              </Text>
            )}
          </Pressable>
        </View>
      );
    }

    if (accountModal === "savedStations") {
      return (
        <View style={styles.modalContent}>
          <View style={styles.inlineActionHeader}>
            <Text style={styles.inlineActionCount}>
              {savedStations.length} {t("savedStationsCountLabel", { defaultValue: "stations saved" })}
            </Text>
            {savedStations.length ? (
              <Pressable
                style={styles.inlineLinkButtonDanger}
                onPress={() =>
                  confirmAction(
                    t("clearSavedStations", { defaultValue: "Clear saved stations" }),
                    t("clearSavedStationsBody", {
                      defaultValue: "This removes all saved stations from this device.",
                    }),
                    async () => {
                      setAccountBusy(true);
                      try {
                        const nextSavedStations = await saveSavedStations([]);
                        setSavedStations(nextSavedStations);
                      } catch (_error) {
                        Alert.alert(t("somethingWentWrong"));
                      } finally {
                        setAccountBusy(false);
                      }
                    }
                  )
                }
              >
                <Text style={styles.inlineLinkButtonDangerText}>
                  {t("clearAllActionLabel", { defaultValue: "Clear all" })}
                </Text>
              </Pressable>
            ) : null}
          </View>

          {!savedStations.length ? (
            <View style={styles.emptyStateCard}>
              <Ionicons name="bookmark-outline" size={24} color="#0F766E" />
              <Text style={styles.emptyStateTitle}>
                {t("savedStationsEmptyTitle", { defaultValue: "No saved stations yet" })}
              </Text>
              <Text style={styles.emptyStateSubtitle}>
                {t("savedStationsEmptyBody", {
                  defaultValue: "Save stations from the Home tab to build your quick-access list here.",
                })}
              </Text>
            </View>
          ) : null}

          {savedStations.map((station) => (
            <View key={station.id} style={styles.savedStationCard}>
              <Text style={styles.savedStationTitle}>{station.name}</Text>
              <Text style={styles.savedStationMeta}>
                {station.address || t("homeScreen.addressMissing")}
              </Text>
              <Text style={styles.savedStationMeta}>
                {t("homeScreen.queue")}: {station.queueLength} {t("homeScreen.units.cars")}
              </Text>

              <View style={styles.cardActionRow}>
                <Pressable style={styles.inlineLinkButton} onPress={() => openSavedStationRoute(station)}>
                  <Text style={styles.inlineLinkButtonText}>{t("homeScreen.route.show")}</Text>
                </Pressable>
                <Pressable style={styles.inlineLinkButton} onPress={() => callSavedStation(station)}>
                  <Text style={styles.inlineLinkButtonText}>
                    {t("callStationCta", { defaultValue: "Call" })}
                  </Text>
                </Pressable>
                <Pressable style={styles.inlineLinkButtonDanger} onPress={() => removeSavedStationItem(station.id)}>
                  <Text style={styles.inlineLinkButtonDangerText}>
                    {t("removeSavedStationCta", { defaultValue: "Remove" })}
                  </Text>
                </Pressable>
              </View>
            </View>
          ))}
        </View>
      );
    }

    return null;
  };

  return (
    <>
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
          <Text
            style={[
              styles.profileMeta,
              user?.emailVerified && !pendingEmail ? styles.profileMetaSuccess : styles.profileMetaWarn,
            ]}
            numberOfLines={2}
          >
            {emailStatusText}
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
          onPress={() => openAccountModal("editProfile")}
        />
        <SettingRow
          icon="key-outline"
          title={t("changePassword")}
          subtitle={t("changePasswordSubtitle")}
          onPress={() => openAccountModal("changePassword")}
        />
        <SettingRow
          icon="car-outline"
          title={t("myVehicles")}
          subtitle={t("myVehiclesSubtitle")}
          valueText={vehicles.length ? String(vehicles.length) : undefined}
          onPress={() => openAccountModal("vehicles")}
        />
        <SettingRow
          icon="bookmark-outline"
          title={t("savedStations")}
          subtitle={t("savedStationsSubtitle")}
          valueText={savedStations.length ? String(savedStations.length) : undefined}
          onPress={() => openAccountModal("savedStations")}
        />
      </View>

      <Text style={styles.sectionTitle}>
        {t("transactionHistoryTitle", { defaultValue: "Transaction History" })}
      </Text>
      <View style={styles.sectionCard}>
        <SettingRow
          icon="receipt-outline"
          title={t("transactionHistoryTitle", { defaultValue: "Transaction History" })}
          subtitle={t("transactionHistorySubtitle", {
            defaultValue: "Open your full transaction history and filter it with Ethiopian calendar dates.",
          })}
          onPress={() => navigation.navigate("TransactionHistory")}
        />
        {false && (
          transactionHistory.map((item, index) => {
            const queueTone = getTransactionTone(item?.status);
            const paymentTone = getTransactionTone(item?.paymentStatus);
            const activityDate =
              item?.depositPaidAt || item?.servedAt || item?.createdAt || item?.updatedAt || item?.joinedAt;

            return (
              <View
                key={String(item?.id || item?.reservationId || index)}
                style={[styles.transactionItem, index > 0 && styles.transactionItemBorder]}
              >
                <View style={styles.transactionItemHeader}>
                  <View style={styles.transactionItemHeaderText}>
                    <Text style={styles.transactionStationName} numberOfLines={1}>
                      {item?.stationName || t("stationDetails.screenTitle", { defaultValue: "Station" })}
                    </Text>
                    <Text style={styles.transactionItemDate}>
                      {formatTransactionDate(activityDate) ||
                        t("transactionHistoryDateUnknown", { defaultValue: "Date unavailable" })}
                    </Text>
                  </View>
                  <View style={styles.transactionBadgeWrap}>
                    <View
                      style={[
                        styles.transactionBadge,
                        queueTone === "success"
                          ? styles.transactionBadgeSuccess
                          : queueTone === "warning"
                            ? styles.transactionBadgeWarning
                            : queueTone === "danger"
                              ? styles.transactionBadgeDanger
                              : styles.transactionBadgeNeutral,
                      ]}
                    >
                      <Text
                        style={[
                          styles.transactionBadgeText,
                          queueTone === "success"
                            ? styles.transactionBadgeTextSuccess
                            : queueTone === "warning"
                              ? styles.transactionBadgeTextWarning
                              : queueTone === "danger"
                                ? styles.transactionBadgeTextDanger
                                : styles.transactionBadgeTextNeutral,
                        ]}
                      >
                        {formatTransactionLabel(item?.status)}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.transactionBadge,
                        paymentTone === "success"
                          ? styles.transactionBadgeSuccess
                          : paymentTone === "warning"
                            ? styles.transactionBadgeWarning
                            : paymentTone === "danger"
                              ? styles.transactionBadgeDanger
                              : styles.transactionBadgeNeutral,
                      ]}
                    >
                      <Text
                        style={[
                          styles.transactionBadgeText,
                          paymentTone === "success"
                            ? styles.transactionBadgeTextSuccess
                            : paymentTone === "warning"
                              ? styles.transactionBadgeTextWarning
                              : paymentTone === "danger"
                                ? styles.transactionBadgeTextDanger
                                : styles.transactionBadgeTextNeutral,
                        ]}
                      >
                        {formatTransactionLabel(item?.paymentStatus)}
                      </Text>
                    </View>
                  </View>
                </View>

                <View style={styles.transactionMetricRow}>
                  <View style={styles.transactionMetric}>
                    <Text style={styles.transactionMetricLabel}>
                      {t("transactionHistoryFuelLabel", { defaultValue: "Fuel" })}
                    </Text>
                    <Text style={styles.transactionMetricValue}>
                      {getTransactionFuelLabel(t, item?.fuelType)}
                    </Text>
                  </View>
                  <View style={styles.transactionMetric}>
                    <Text style={styles.transactionMetricLabel}>
                      {t("transactionHistoryLitersLabel", { defaultValue: "Liters" })}
                    </Text>
                    <Text style={styles.transactionMetricValue}>
                      {Number(item?.requestedLiters || 0).toFixed(2)} L
                    </Text>
                  </View>
                  <View style={styles.transactionMetric}>
                    <Text style={styles.transactionMetricLabel}>
                      {t("transactionHistoryAmountLabel", { defaultValue: "Amount" })}
                    </Text>
                    <Text style={styles.transactionMetricValue}>
                      {formatTransactionMoney(item?.estimatedAmount, item?.currency)}
                    </Text>
                  </View>
                </View>

                <Text style={styles.transactionMetaLine}>
                  {t("transactionHistoryDepositLabel", { defaultValue: "Deposit" })}:{" "}
                  {formatTransactionMoney(item?.depositAmount, item?.currency)}
                </Text>
                {item?.reservationCode ? (
                  <Text style={styles.transactionMetaLine}>
                    {t("transactionHistoryReservationLabel", { defaultValue: "Reservation" })}: {item.reservationCode}
                  </Text>
                ) : null}
                {item?.paymentProvider || item?.paymentReference ? (
                  <Text style={styles.transactionMetaLine}>
                    {t("transactionHistoryPaymentLabel", { defaultValue: "Payment" })}:{" "}
                    {formatTransactionLabel(
                      item?.paymentProvider,
                      t("transactionHistoryPaymentUnknown", { defaultValue: "Not available" })
                    )}
                    {item?.paymentReference ? ` • Ref ${item.paymentReference}` : ""}
                  </Text>
                ) : null}
                {item?.checkInStatus && String(item.checkInStatus).trim().toLowerCase() !== "pending" ? (
                  <Text style={styles.transactionMetaLine}>
                    {t("transactionHistoryCheckInLabel", { defaultValue: "Check-in" })}:{" "}
                    {formatTransactionLabel(item.checkInStatus)}
                  </Text>
                ) : null}
                {item?.address ? (
                  <Text style={styles.transactionMetaLine} numberOfLines={2}>
                    {item.address}
                  </Text>
                ) : null}
              </View>
            );
          })
        )}
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
          onPress={handlePushNotificationsToggle}
          right={
            <Switch
              value={prefs.pushNotifs}
              onValueChange={handlePushNotificationsToggle}
            />
          }
        />
        <SettingRow
          icon="navigate-outline"
          title={t("nearbyFuelAlerts", { defaultValue: "Nearby fuel alerts" })}
          subtitle={
            !prefs.pushNotifs
              ? t("nearbyFuelAlertsNeedsPush", {
                  defaultValue: "Turn on push notifications to receive nearby fuel alerts.",
                })
              : !prefs.locationSharing
                ? t("nearbyFuelAlertsNeedsLocation", {
                    defaultValue: "Keep location sharing enabled so FuelFinder can spot stations near your route.",
                  })
                : t("nearbyFuelAlertsSubtitle", {
                    defaultValue:
                      "Notify me when my preferred fuel is available at a nearby station while I travel.",
                  })
          }
          onPress={handleNearbyFuelAlertsToggle}
          right={
            <Switch
              value={prefs.nearbyFuelAlerts}
              onValueChange={handleNearbyFuelAlertsToggle}
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
          onPress={handleLocationSharingToggle}
          right={
            <Switch
              value={prefs.locationSharing}
              onValueChange={handleLocationSharingToggle}
            />
          }
        />
        <SettingRow
          icon="finger-print-outline"
          title={t("biometricUnlock")}
          subtitle={t("biometricUnlockSubtitle")}
          onPress={handleBiometricToggle}
          right={
            <Switch
              value={prefs.biometricUnlock}
              onValueChange={handleBiometricToggle}
            />
          }
        />
        <SettingRow
          icon="shield-checkmark-outline"
          title={t("twoFactorAuth")}
          subtitle={
            user?.phoneVerified
              ? t("twoFactorAuthSubtitle")
              : t("twoFactorPhoneVerifiedBody", {
                  defaultValue: "Two-factor authentication requires a verified phone number.",
                })
          }
          valueText={
            user?.twoFactorEnabled
              ? t("twoFactorEnabledLabel", { defaultValue: "Enabled" })
              : undefined
          }
          onPress={handleTwoFactorToggle}
          right={
            <Switch
              value={Boolean(user?.twoFactorEnabled)}
              onValueChange={handleTwoFactorToggle}
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

      <Modal
        visible={Boolean(accountModal)}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeAccountModal}
      >
        <KeyboardAvoidingView
          style={styles.modalScreen}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.modalHeader}>
            <View style={styles.modalHeaderTextWrap}>
              <Text style={styles.modalTitle}>{modalMeta[accountModal]?.title || t("account")}</Text>
              <Text style={styles.modalSubtitle}>
                {modalMeta[accountModal]?.subtitle || ""}
              </Text>
            </View>
            <Pressable style={styles.modalCloseButton} onPress={closeAccountModal}>
              <Ionicons name="close" size={20} color="#0F172A" />
            </Pressable>
          </View>
          <ScrollView
            style={styles.modalScroll}
            contentContainerStyle={styles.modalScrollContent}
            showsVerticalScrollIndicator={false}
          >
            {renderAccountModalContent()}
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}







function HomeStackNavigator() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const HomeComponent =
    String(user?.preferredStationType || "").trim().toLowerCase() === "electric"
      ? ElectricHomeScreen
      : HomeScreen;
  return (
    <HomeStack.Navigator>
      <HomeStack.Screen
        name="HomeMain"
        component={HomeComponent}
        options={{ headerShown: false }}
      />
      <HomeStack.Screen
        name="StationDetails"
        component={StationDetails}
        options={{ title: t("stationDetails.screenTitle", { defaultValue: "Station Details" }) }}
      />
      <HomeStack.Screen
        name="ElectricStationDetails"
        component={ElectricStationDetails}
        options={{
          title: t("electricStationDetails.screenTitle", { defaultValue: "EV Station Details" }),
        }}
      />
    </HomeStack.Navigator>
  );
}

function ProfileStackNavigator() {
  const { t } = useLanguage();
  return (
    <ProfileStack.Navigator>
      <ProfileStack.Screen
        name="ProfileMain"
        component={ProfileScreen}
        options={{ headerShown: false }}
      />
      <ProfileStack.Screen
        name="TransactionHistory"
        component={TransactionHistoryScreen}
        options={{ title: t("transactionHistoryTitle", { defaultValue: "Transaction History" }) }}
      />
    </ProfileStack.Navigator>
  );
}

function AppTabs() {
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const tabBarHeight = 64 + insets.bottom;
  const [alertBadgeCount, setAlertBadgeCount] = React.useState(0);

  React.useEffect(() => {
    let mounted = true;

    const syncUnreadCount = async () => {
      try {
        const unreadCount = await loadUnreadFuelAlertCount();
        if (mounted) {
          setAlertBadgeCount(unreadCount);
        }
      } catch (_error) {
        if (mounted) {
          setAlertBadgeCount(0);
        }
      }
    };

    syncUnreadCount();
    const unsubscribe = subscribeToFuelAlertHistory((alerts) => {
      if (!mounted) return;
      const unreadCount = (alerts || []).reduce(
        (count, alert) => count + (alert?.readAt ? 0 : 1),
        0
      );
      setAlertBadgeCount(unreadCount);
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: "#0F766E",
        tabBarInactiveTintColor: "#64748B",
        tabBarStyle: {
          height: tabBarHeight,
          paddingTop: 6,
          paddingBottom: 8 + insets.bottom,
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
      <Tab.Screen name="Map" component={MapScreen} options={{ title: t("map") }} />
      <Tab.Screen
        name="Alerts"
        options={{
          title: t("alerts"),
          tabBarBadge: alertBadgeCount > 0 ? (alertBadgeCount > 99 ? "99+" : alertBadgeCount) : undefined,
          tabBarBadgeStyle: styles.alertTabBadge,
        }}
        component={AlertsScreen}
      />
      <Tab.Screen name="Profile" component={ProfileStackNavigator} options={{ title: t("profile") }} />
    </Tab.Navigator>
  );
}

function AuthStack() {
  return (
    <RootStack.Navigator screenOptions={{ headerShown: false }}>
      <RootStack.Screen name="Login" component={LoginScreen} />
      <RootStack.Screen name="Register" component={RegisterScreen} />
      <RootStack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
      <RootStack.Screen name="VerifyPhone" component={PhoneVerifyScreen} />
      <RootStack.Screen name="ResetPassword" component={ResetPasswordScreen} />
    </RootStack.Navigator>
  );
}

function StationDiscoveryStack() {
  return (
    <RootStack.Navigator screenOptions={{ headerShown: false }}>
      <RootStack.Screen name="StationDiscoveryChoice" component={StationDiscoveryChoiceScreen} />
    </RootStack.Navigator>
  );
}

function AppNavigator() {
  const { isLoading, isAuthenticated, signOut, user } = useAuth();
  const { t } = useLanguage();
  const [requiresBiometricUnlock, setRequiresBiometricUnlock] = React.useState(false);
  const [isUnlocking, setIsUnlocking] = React.useState(false);
  const appStateRef = React.useRef(AppState.currentState);
  const requiresStationChoice =
    isAuthenticated &&
    String(user?.role || "") === "customer" &&
    !String(user?.preferredStationType || "").trim();

  const runBiometricUnlock = React.useCallback(async () => {
    if (!isAuthenticated) {
      setRequiresBiometricUnlock(false);
      return;
    }

    try {
      const enabled = (await AsyncStorage.getItem(BIOMETRIC_PREF_KEY)) === "1";
      if (!enabled) {
        setRequiresBiometricUnlock(false);
        return;
      }

      const availability = await getBiometricAvailability();
      if (!availability.hasHardware || !availability.isEnrolled) {
        await AsyncStorage.setItem(BIOMETRIC_PREF_KEY, "0");
        await clearBiometricLoginCredential();
        setRequiresBiometricUnlock(false);
        Alert.alert(
          t("biometricResetTitle", { defaultValue: "Biometric unlock turned off" }),
          t("biometricResetBody", {
            defaultValue: "Biometric unlock was disabled because this device is not ready for biometric authentication.",
          })
        );
        return;
      }

      setRequiresBiometricUnlock(true);
      setIsUnlocking(true);
      const methodLabel = getBiometricMethodLabel(t, availability.authTypes);
      const result = await requestBiometricAuthentication(
        t,
        availability.authTypes,
        t("biometricUnlockPrompt", {
          defaultValue: `Unlock FuelFinder with ${methodLabel}`,
        })
      );

      if (result.success) {
        setRequiresBiometricUnlock(false);
        return;
      }

      if (
        result.error &&
        !["user_cancel", "system_cancel", "app_cancel"].includes(result.error)
      ) {
        Alert.alert(
          t("biometricFailedTitle", { defaultValue: "Biometric check failed" }),
          t("biometricRetryBody", {
            defaultValue: "Unlock with biometrics to continue using the app.",
          })
        );
      }
    } catch (_error) {
      Alert.alert(t("somethingWentWrong"));
    } finally {
      setIsUnlocking(false);
    }
  }, [isAuthenticated, t]);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!isAuthenticated) {
        if (!cancelled) {
          setRequiresBiometricUnlock(false);
          setIsUnlocking(false);
        }
        return;
      }

      const enabled = (await AsyncStorage.getItem(BIOMETRIC_PREF_KEY)) === "1";
      if (!enabled || cancelled) {
        if (!cancelled) setRequiresBiometricUnlock(false);
        return;
      }

      await runBiometricUnlock();
    })();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, runBiometricUnlock]);

  React.useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextAppState) => {
      const prevAppState = appStateRef.current;
      appStateRef.current = nextAppState;
      if (
        isAuthenticated &&
        (prevAppState === "inactive" || prevAppState === "background") &&
        nextAppState === "active"
      ) {
        runBiometricUnlock();
      }
    });

    return () => subscription.remove();
  }, [isAuthenticated, runBiometricUnlock]);

  if (isLoading) {
    return <LoadingScreen />;
  }

  return (
    <NavigationContainer>
      <View style={styles.navigatorRoot}>
        <OfflineStatusBanner />
        {isAuthenticated
          ? requiresStationChoice
            ? <StationDiscoveryStack />
            : <AppTabs />
          : <AuthStack />}
        <FuelAlertMonitor enabled={isAuthenticated && !requiresBiometricUnlock} />
        <PushNotificationMonitor enabled={isAuthenticated && !requiresBiometricUnlock} />
        <QueueTurnAlertMonitor enabled={isAuthenticated && !requiresBiometricUnlock} />
        {isAuthenticated && requiresBiometricUnlock ? (
          <View style={styles.biometricOverlay}>
            <View style={styles.biometricCard}>
              <View style={styles.biometricIconWrap}>
                <Ionicons name="shield-checkmark-outline" size={30} color="#0F766E" />
              </View>
              <Text style={styles.biometricTitle}>
                {t("biometricOverlayTitle", { defaultValue: "Unlock FuelFinder" })}
              </Text>
              <Text style={styles.biometricSubtitle}>
                {t("biometricOverlayBody", {
                  defaultValue: "Use your device biometrics to unlock the app and continue securely.",
                })}
              </Text>
              <Pressable
                style={[styles.biometricPrimaryButton, isUnlocking && styles.modalButtonDisabled]}
                onPress={runBiometricUnlock}
                disabled={isUnlocking}
              >
                {isUnlocking ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.biometricPrimaryButtonText}>
                    {t("biometricRetryCta", { defaultValue: "Unlock now" })}
                  </Text>
                )}
              </Pressable>
              <Pressable style={styles.biometricSecondaryButton} onPress={signOut}>
                <Text style={styles.biometricSecondaryButtonText}>
                  {t("logout")}
                </Text>
              </Pressable>
            </View>
          </View>
        ) : null}
      </View>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <LanguageProvider>
          <AuthProvider>
            <OfflineProvider>
              <AppNavigator />
            </OfflineProvider>
          </AuthProvider>
        </LanguageProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  navigatorRoot: {
    flex: 1,
  },
  offlineBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  offlineBannerWarn: {
    backgroundColor: "#FEF3C7",
    borderBottomColor: "#FCD34D",
  },
  offlineBannerSync: {
    backgroundColor: "#CFFAFE",
    borderBottomColor: "#67E8F9",
  },
  offlineBannerText: {
    flex: 1,
    fontSize: 12,
    fontWeight: "800",
  },
  offlineBannerTextWarn: {
    color: "#78350F",
  },
  offlineBannerTextSync: {
    color: "#164E63",
  },
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
  biometricOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  biometricCard: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 22,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  biometricIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#CCFBF1",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  biometricTitle: {
    fontSize: 20,
    fontWeight: "900",
    color: "#0F172A",
    textAlign: "center",
  },
  biometricSubtitle: {
    marginTop: 8,
    marginBottom: 20,
    fontSize: 13,
    lineHeight: 20,
    fontWeight: "700",
    color: "#64748B",
    textAlign: "center",
  },
  biometricPrimaryButton: {
    width: "100%",
    minHeight: 50,
    borderRadius: 14,
    backgroundColor: "#0F766E",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  biometricPrimaryButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "900",
  },
  biometricSecondaryButton: {
    width: "100%",
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  biometricSecondaryButtonText: {
    color: "#0F172A",
    fontSize: 14,
    fontWeight: "800",
  },
  alertTabBadge: {
    backgroundColor: "#DC2626",
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "900",
    minWidth: 18,
    height: 18,
    lineHeight: 12,
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
  profileMetaSuccess: {
    color: "#166534",
  },
  profileMetaWarn: {
    color: "#92400E",
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
  transactionSectionHeader: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#EEF2F6",
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  transactionSectionHeaderText: {
    flex: 1,
  },
  transactionSectionHeading: {
    color: "#0F172A",
    fontSize: 14,
    fontWeight: "900",
  },
  transactionSectionSubtitle: {
    marginTop: 4,
    color: "#64748B",
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "700",
  },
  transactionSectionActions: {
    alignItems: "flex-end",
    gap: 8,
  },
  transactionCount: {
    color: "#475569",
    fontSize: 11,
    fontWeight: "800",
  },
  transactionStateWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 14,
  },
  transactionEmptyWrap: {
    padding: 12,
  },
  transactionItem: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 10,
  },
  transactionItemBorder: {
    borderTopWidth: 1,
    borderTopColor: "#EEF2F6",
  },
  transactionItemHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  transactionItemHeaderText: {
    flex: 1,
  },
  transactionStationName: {
    color: "#0F172A",
    fontSize: 15,
    fontWeight: "900",
  },
  transactionItemDate: {
    marginTop: 2,
    color: "#64748B",
    fontSize: 12,
    fontWeight: "700",
  },
  transactionBadgeWrap: {
    flexDirection: "row",
    gap: 6,
    flexWrap: "wrap",
    justifyContent: "flex-end",
    maxWidth: "48%",
  },
  transactionBadge: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  transactionBadgeText: {
    fontSize: 11,
    fontWeight: "800",
  },
  transactionBadgeNeutral: {
    backgroundColor: "#F8FAFC",
    borderColor: "#CBD5E1",
  },
  transactionBadgeTextNeutral: {
    color: "#475569",
  },
  transactionBadgeSuccess: {
    backgroundColor: "#DCFCE7",
    borderColor: "#86EFAC",
  },
  transactionBadgeTextSuccess: {
    color: "#166534",
  },
  transactionBadgeWarning: {
    backgroundColor: "#FEF3C7",
    borderColor: "#FCD34D",
  },
  transactionBadgeTextWarning: {
    color: "#92400E",
  },
  transactionBadgeDanger: {
    backgroundColor: "#FEE2E2",
    borderColor: "#FCA5A5",
  },
  transactionBadgeTextDanger: {
    color: "#B91C1C",
  },
  transactionMetricRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  transactionMetric: {
    flex: 1,
    minWidth: 95,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  transactionMetricLabel: {
    color: "#64748B",
    fontSize: 11,
    fontWeight: "700",
  },
  transactionMetricValue: {
    marginTop: 4,
    color: "#0F172A",
    fontSize: 13,
    fontWeight: "900",
  },
  transactionMetaLine: {
    color: "#475569",
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "700",
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
  modalScreen: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  modalHeader: {
    paddingTop: 18,
    paddingBottom: 14,
    paddingHorizontal: 16,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  modalHeaderTextWrap: {
    flex: 1,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: "#0F172A",
  },
  modalSubtitle: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 18,
    color: "#64748B",
    fontWeight: "700",
  },
  modalCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F1F5F9",
  },
  modalScroll: {
    flex: 1,
  },
  modalScrollContent: {
    padding: 16,
    paddingBottom: 28,
  },
  modalContent: {
    gap: 14,
  },
  inputGroup: {
    gap: 6,
  },
  inputLabel: {
    fontSize: 13,
    color: "#0F172A",
    fontWeight: "800",
  },
  textInput: {
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: "#0F172A",
    fontWeight: "600",
  },
  textInputDisabled: {
    backgroundColor: "#F1F5F9",
    color: "#64748B",
  },
  inputHelper: {
    fontSize: 12,
    lineHeight: 18,
    color: "#64748B",
    fontWeight: "600",
  },
  modalHelperText: {
    fontSize: 12,
    lineHeight: 18,
    color: "#64748B",
    fontWeight: "700",
  },
  modalActionRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 6,
  },
  modalPrimaryButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: "#0F766E",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  modalPrimaryButtonText: {
    color: "#FFFFFF",
    fontWeight: "900",
    fontSize: 14,
  },
  modalSecondaryButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  modalSecondaryButtonText: {
    color: "#0F172A",
    fontWeight: "800",
    fontSize: 14,
  },
  modalButtonDisabled: {
    opacity: 0.7,
  },
  inlineActionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
  },
  inlineActionCount: {
    color: "#334155",
    fontSize: 12,
    fontWeight: "800",
  },
  modalGhostButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#CCFBF1",
    borderWidth: 1,
    borderColor: "#5EEAD4",
  },
  modalGhostButtonText: {
    color: "#0F766E",
    fontSize: 12,
    fontWeight: "800",
  },
  editorCard: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 18,
    padding: 14,
    gap: 12,
  },
  editorTitle: {
    fontSize: 15,
    fontWeight: "900",
    color: "#0F172A",
  },
  chipRowCompact: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 8,
  },
  switchTextWrap: {
    flex: 1,
    gap: 3,
  },
  switchTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: "#0F172A",
  },
  switchSubtitle: {
    fontSize: 12,
    lineHeight: 18,
    color: "#64748B",
    fontWeight: "600",
  },
  emptyStateCard: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 18,
    padding: 20,
    alignItems: "center",
    gap: 8,
  },
  emptyStateTitle: {
    color: "#0F172A",
    fontSize: 15,
    fontWeight: "900",
    textAlign: "center",
  },
  emptyStateSubtitle: {
    color: "#64748B",
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "600",
    textAlign: "center",
  },
  vehicleCard: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 18,
    padding: 14,
    gap: 10,
  },
  vehicleHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  vehicleHeaderText: {
    flex: 1,
  },
  vehicleTitle: {
    color: "#0F172A",
    fontSize: 15,
    fontWeight: "900",
  },
  vehicleMeta: {
    marginTop: 4,
    color: "#64748B",
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "700",
  },
  primaryBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "#DBEAFE",
    borderWidth: 1,
    borderColor: "#93C5FD",
  },
  primaryBadgeText: {
    color: "#1D4ED8",
    fontSize: 11,
    fontWeight: "900",
  },
  cardActionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  inlineLinkButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
  },
  inlineLinkButtonText: {
    color: "#1D4ED8",
    fontSize: 12,
    fontWeight: "800",
  },
  inlineLinkButtonDanger: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  inlineLinkButtonDangerText: {
    color: "#B91C1C",
    fontSize: 12,
    fontWeight: "800",
  },
  savedStationCard: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 18,
    padding: 14,
    gap: 6,
  },
  savedStationTitle: {
    color: "#0F172A",
    fontSize: 15,
    fontWeight: "900",
  },
  savedStationMeta: {
    color: "#64748B",
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "700",
  },
  bottomSpacer: {
    height: 24,
  },
});
