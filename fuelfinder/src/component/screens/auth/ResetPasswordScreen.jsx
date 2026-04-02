import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
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

export default function ResetPasswordScreen({ navigation, route }) {
  const { finishPasswordReset } = useAuth();
  const { t } = useLanguage();
  const resetToken = String(route?.params?.resetToken || "").trim();
  const email = String(route?.params?.email || "").trim();
  const phone = String(route?.params?.phone || "").trim();

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    setError("");

    if (!resetToken) {
      setError("Missing reset token. Start the reset process again.");
      return;
    }
    if (!newPassword || !confirmPassword) {
      setError("Enter and confirm your new password.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Your new password and confirmation must match.");
      return;
    }

    setLoading(true);
    try {
      const data = await finishPasswordReset({ resetToken, newPassword });
      Alert.alert(
        "Password updated",
        data?.message || "Your password has been reset successfully.",
        [
          {
            text: "Back to login",
            onPress: () =>
              navigation.reset({
                index: 0,
                routes: [{ name: "Login", params: { email } }],
              }),
          },
        ]
      );
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
            <Text style={styles.title}>Set New Password</Text>
            <Text style={styles.subtitle}>
              {phone
                ? `Reset code confirmed for ${phone}.`
                : "Choose a strong password for your account."}
            </Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Create a new password</Text>
            <Text style={styles.cardSubtitle}>
              Use at least 8 characters with uppercase, lowercase, number, and symbol.
            </Text>

            <Text style={styles.label}>New password</Text>
            <View style={styles.passwordRow}>
              <TextInput
                placeholder="********"
                secureTextEntry={!showNewPassword}
                value={newPassword}
                onChangeText={setNewPassword}
                style={styles.passwordInput}
              />
              <Pressable onPress={() => setShowNewPassword((current) => !current)}>
                <Ionicons
                  name={showNewPassword ? "eye-off-outline" : "eye-outline"}
                  size={22}
                  color="#777"
                />
              </Pressable>
            </View>

            <Text style={styles.label}>Confirm password</Text>
            <View style={styles.passwordRow}>
              <TextInput
                placeholder="********"
                secureTextEntry={!showConfirmPassword}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                style={styles.passwordInput}
              />
              <Pressable onPress={() => setShowConfirmPassword((current) => !current)}>
                <Ionicons
                  name={showConfirmPassword ? "eye-off-outline" : "eye-outline"}
                  size={22}
                  color="#777"
                />
              </Pressable>
            </View>

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Pressable style={styles.primaryBtn} onPress={onSubmit} disabled={loading}>
              {loading ? (
                <ActivityIndicator color="#000" />
              ) : (
                <Text style={styles.primaryText}>Save new password</Text>
              )}
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
    minHeight: 560,
  },
  cardTitle: { fontSize: 20, fontWeight: "800", marginBottom: 5 },
  cardSubtitle: { color: "#777", fontSize: 13, marginBottom: 20 },
  label: { fontSize: 13, color: "#777" },
  passwordRow: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#ddd",
    marginBottom: 15,
  },
  passwordInput: { flex: 1, paddingVertical: 10 },
  primaryBtn: {
    backgroundColor: "#FFC107",
    padding: 14,
    borderRadius: 30,
    alignItems: "center",
    marginTop: 8,
  },
  primaryText: { fontWeight: "700", fontSize: 15 },
  error: { color: "red", marginBottom: 10 },
});
