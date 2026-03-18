import "react-native-gesture-handler";
import React from "react";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  ActivityIndicator,
  Alert,
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
import HomeScreen from "./src/component/screens/home/HomeScreen";
import StationDetails from "./src/component/screens/home/StationDetails";
import LoginScreen from "./src/component/screens/auth/LoginScreen";
import RegisterScreen from "./src/component/screens/auth/RegisterScreen";
import PhoneVerifyScreen from "./src/component/screens/auth/PhoneVerifyScreen";
import { changeMyPassword, updateMyProfile } from "./src/component/services/authService";
import {
  loadSavedStations,
  loadVehicles,
  removeSavedStation,
  removeVehicle,
  saveSavedStations,
  saveVehicles,
  upsertVehicle,
} from "./src/component/services/accountStorage";
import { AuthProvider, useAuth } from "./src/component/context/AuthContext";
import { LanguageProvider, useLanguage } from "./src/component/context/LanguageContext";

const queryClient = new QueryClient();
const RootStack = createNativeStackNavigator();
const HomeStack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

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

function PlaceholderScreen({ title }) {
  const { t } = useLanguage();
  return (
    <View style={styles.placeholderScreen}>
      <Text style={styles.placeholderTitle}>{title}</Text>
      <Text style={styles.placeholderSubTitle}>{t("comingSoon")}</Text>
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

function ProfileScreen() {
  const { user, signOut, replaceUser } = useAuth();
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

  const resetVehicleEditor = React.useCallback(() => {
    setVehicleEditorVisible(false);
    setVehicleDraft(createEmptyVehicleDraft(prefs.preferredFuel));
  }, [prefs.preferredFuel]);

  const closeAccountModal = React.useCallback(() => {
    setAccountModal("");
    setAccountBusy(false);
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
      await replaceUser(data.user);
      Alert.alert(
        t("done"),
        data?.message || t("profileUpdated", { defaultValue: "Profile updated successfully." })
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
  }, [closeAccountModal, profileForm.email, profileForm.name, profileForm.phone, replaceUser, t]);

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

    const url = `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
    openUrl(url);
  }, [openUrl, t]);

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
                    {vehicle.plateNumber ? ` • ${vehicle.plateNumber}` : ""}
                    {vehicle.tankCapacityLiters ? ` • ${vehicle.tankCapacityLiters}L` : ""}
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
  const insets = useSafeAreaInsets();
  const tabBarHeight = 64 + insets.bottom;
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
      <RootStack.Screen name="VerifyPhone" component={PhoneVerifyScreen} />
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
