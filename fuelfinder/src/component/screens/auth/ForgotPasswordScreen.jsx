import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../context/AuthContext";
import { useLanguage } from "../../context/LanguageContext";
import { API_BASE_URL } from "../../services/api";

export default function ForgotPasswordScreen({ navigation, route }) {
  const { beginPasswordReset } = useAuth();
  const { t } = useLanguage();
  const [email, setEmail] = useState(String(route?.params?.email || ""));
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    const normalizedEmail = String(email || "").trim().toLowerCase();
    setError("");

    if (!normalizedEmail) {
      setError("Enter your email address.");
      return;
    }

    setLoading(true);
    try {
      const data = await beginPasswordReset({ email: normalizedEmail });
      if (!data?.verificationToken) {
        setError(t("somethingWentWrong"));
        return;
      }

      navigation.navigate("VerifyPhone", {
        verificationToken: data.verificationToken,
        phone: data?.maskedPhone || "",
        email: data?.email || normalizedEmail,
        flowType: "password_reset",
      });
    } catch (err) {
      const backendMessage = err?.response?.data?.message;
      if (backendMessage) {
        setError(backendMessage);
      } else {
        setError(`${t("somethingWentWrong")} (${API_BASE_URL}).`);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <Pressable style={styles.backBtn} onPress={() => navigation.goBack()}>
              <Ionicons name="arrow-back" size={20} color="#000" />
            </Pressable>
            <Text style={styles.title}>Forgot Password</Text>
            <Text style={styles.subtitle}>
              Enter your email and we will send a reset code to your verified phone number.
            </Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Reset your password</Text>
            <Text style={styles.cardSubtitle}>
              Use the email linked to your FuelFinder account.
            </Text>

            <Text style={styles.label}>Email</Text>
            <TextInput
              placeholder="you@example.com"
              value={email}
              onChangeText={setEmail}
              style={styles.input}
              autoCapitalize="none"
              keyboardType="email-address"
            />

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Pressable style={styles.primaryBtn} onPress={onSubmit} disabled={loading}>
              {loading ? (
                <ActivityIndicator color="#000" />
              ) : (
                <Text style={styles.primaryText}>Send reset code</Text>
              )}
            </Pressable>

            <Pressable style={styles.secondaryBtn} onPress={() => navigation.navigate("Login")}>
              <Text style={styles.secondaryText}>Back to login</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#0F766E" },
  header: { padding: 20, paddingBottom: 30 },
  backBtn: {
    width: 40,
    height: 40,
    backgroundColor: "#fff",
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  title: { fontSize: 34, fontWeight: "900" },
  subtitle: { fontSize: 16, color: "#333" },
  card: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 35,
    borderTopRightRadius: 35,
    padding: 25,
    minHeight: 520,
  },
  cardTitle: { fontSize: 20, fontWeight: "800", marginBottom: 5 },
  cardSubtitle: { color: "#777", fontSize: 13, marginBottom: 20 },
  label: { fontSize: 13, color: "#777" },
  input: {
    borderBottomWidth: 1,
    borderBottomColor: "#ddd",
    paddingVertical: 10,
    marginBottom: 15,
  },
  primaryBtn: {
    backgroundColor: "#FFC107",
    padding: 14,
    borderRadius: 30,
    alignItems: "center",
    marginBottom: 14,
  },
  primaryText: { fontWeight: "700", fontSize: 15 },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: "#0F766E",
    borderRadius: 30,
    padding: 14,
    alignItems: "center",
  },
  secondaryText: { color: "#0F766E", fontWeight: "700", fontSize: 15 },
  error: { color: "red", marginBottom: 10 },
});
