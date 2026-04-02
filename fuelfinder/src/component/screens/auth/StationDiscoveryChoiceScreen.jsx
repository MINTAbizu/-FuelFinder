import React, { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "../../context/AuthContext";
import { updateMyProfile } from "../../services/authService";

const OPTIONS = [
  {
    value: "fuel",
    title: "Fuel Station Home",
    subtitle: "Keep the current fuel-station home page and fuel discovery flow.",
    icon: "car-sport-outline",
    backgroundColor: "#CCFBF1",
    borderColor: "#99F6E4",
    accentColor: "#0F766E",
  },
  {
    value: "electric",
    title: "Electric Station Home",
    subtitle: "Open the electric-station home page with the same structure and EV station results.",
    icon: "flash-outline",
    backgroundColor: "#F3E8FF",
    borderColor: "#D8B4FE",
    accentColor: "#7C3AED",
  },
];

export default function StationDiscoveryChoiceScreen() {
  const { user, replaceUser, signOut } = useAuth();
  const [savingChoice, setSavingChoice] = useState("");
  const [error, setError] = useState("");

  const handleSelect = async (preferredStationType) => {
    if (!user?.email || !user?.name) {
      setError("Your account details are missing. Please sign in again.");
      return;
    }

    setSavingChoice(preferredStationType);
    setError("");

    try {
      const data = await updateMyProfile({
        name: String(user.name || "").trim(),
        email: String(user.email || "").trim(),
        phone: String(user.phone || "").trim(),
        preferredStationType,
      });

      const nextUser = data?.user || {
        ...user,
        preferredStationType,
      };

      await replaceUser(nextUser);
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "Failed to save your home page choice.");
    } finally {
      setSavingChoice("");
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.hero}>
          <View style={styles.heroBadge}>
            <Ionicons name="compass-outline" size={18} color="#0F172A" />
            <Text style={styles.heroBadgeText}>Choose Home Page</Text>
          </View>
          <Text style={styles.title}>Select the station home page you want</Text>
          <Text style={styles.subtitle}>
            Your choice decides which home page opens after registration: the current fuel page or a matching electric page.
          </Text>
        </View>

        <View style={styles.options}>
          {OPTIONS.map((option) => {
            const isSaving = savingChoice === option.value;
            return (
              <Pressable
                key={option.value}
                style={[
                  styles.optionCard,
                  {
                    backgroundColor: option.backgroundColor,
                    borderColor: option.borderColor,
                  },
                ]}
                disabled={Boolean(savingChoice)}
                onPress={() => handleSelect(option.value)}
              >
                <View
                  style={[
                    styles.optionIconWrap,
                    { backgroundColor: option.accentColor },
                  ]}
                >
                  {isSaving ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Ionicons name={option.icon} size={22} color="#FFFFFF" />
                  )}
                </View>
                <View style={styles.optionCopy}>
                  <Text style={[styles.optionTitle, { color: option.accentColor }]}>
                    {option.title}
                  </Text>
                  <Text style={styles.optionSubtitle}>{option.subtitle}</Text>
                </View>
                <Ionicons name="arrow-forward" size={20} color={option.accentColor} />
              </Pressable>
            );
          })}
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable style={styles.secondaryAction} onPress={signOut} disabled={Boolean(savingChoice)}>
          <Text style={styles.secondaryActionText}>Sign out</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  container: {
    flex: 1,
    paddingHorizontal: 22,
    paddingTop: 12,
    paddingBottom: 24,
  },
  hero: {
    paddingTop: 12,
    paddingBottom: 18,
  },
  heroBadge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 999,
    backgroundColor: "#E2E8F0",
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginBottom: 18,
  },
  heroBadgeText: {
    color: "#0F172A",
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  title: {
    color: "#0F172A",
    fontSize: 30,
    fontWeight: "900",
    lineHeight: 36,
    marginBottom: 10,
  },
  subtitle: {
    color: "#475569",
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "600",
  },
  options: {
    gap: 14,
    marginTop: 6,
  },
  optionCard: {
    borderWidth: 1,
    borderRadius: 26,
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 3,
  },
  optionIconWrap: {
    width: 50,
    height: 50,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  optionCopy: {
    flex: 1,
  },
  optionTitle: {
    fontSize: 18,
    fontWeight: "900",
    marginBottom: 4,
  },
  optionSubtitle: {
    color: "#334155",
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "600",
  },
  error: {
    marginTop: 16,
    color: "#B91C1C",
    fontSize: 13,
    fontWeight: "700",
  },
  secondaryAction: {
    marginTop: "auto",
    alignSelf: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  secondaryActionText: {
    color: "#475569",
    fontSize: 13,
    fontWeight: "800",
  },
});
