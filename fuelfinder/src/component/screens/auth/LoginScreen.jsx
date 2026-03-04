import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../../context/AuthContext";
import { useLanguage } from "../../context/LanguageContext";
import { API_BASE_URL } from "../../services/api";

export default function LoginScreen({ navigation }) {
  const { signIn } = useAuth();
  const { t } = useLanguage();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const onLogin = async () => {
    setError("");
    if (!email.trim() || !password) {
      setError(t("auth.login.requiredError"));
      return;
    }

    setLoading(true);
    try {
      await signIn({ email: email.trim(), password });
    } catch (err) {
      const backendMessage = err?.response?.data?.message;
      if (backendMessage) {
        setError(backendMessage);
      } else {
        setError(`${t("auth.login.cannotConnect")} (${API_BASE_URL}).`);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Text style={styles.title}>{t("auth.login.title")}</Text>
        <Text style={styles.subtitle}>{t("auth.login.subtitle")}</Text>

        <TextInput
          placeholder={t("auth.login.email")}
          value={email}
          onChangeText={setEmail}
          style={styles.input}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <TextInput
          placeholder={t("auth.login.password")}
          value={password}
          onChangeText={setPassword}
          style={styles.input}
          secureTextEntry
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable style={styles.primaryBtn} onPress={onLogin} disabled={loading}>
          {loading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.primaryBtnText}>{t("auth.login.button")}</Text>
          )}
        </Pressable>

        <View style={styles.row}>
          <Text style={styles.helper}>{t("auth.login.newHere")}</Text>
          <Pressable onPress={() => navigation.navigate("Register")}>
            <Text style={styles.link}> {t("auth.login.createAccount")}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#F4F7FB" },
  container: { flex: 1, padding: 18, justifyContent: "center" },
  title: { fontSize: 28, fontWeight: "900", color: "#0F172A", marginBottom: 4 },
  subtitle: { color: "#64748B", marginBottom: 20, fontWeight: "600" },
  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 10,
  },
  error: { color: "#B91C1C", marginBottom: 10, fontWeight: "600" },
  primaryBtn: {
    marginTop: 2,
    height: 46,
    borderRadius: 12,
    backgroundColor: "#0F766E",
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  row: { flexDirection: "row", justifyContent: "center", marginTop: 12 },
  helper: { color: "#475569", fontWeight: "600" },
  link: { color: "#1D4ED8", fontWeight: "800" },
});
