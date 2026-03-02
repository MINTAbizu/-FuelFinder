import React, { useMemo, useState } from "react";
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

const I18N = {
  en: {
    title: "Welcome Back",
    subtitle: "Login to continue with FuelFinder",
    email: "Email",
    password: "Password",
    requiredError: "Enter both email and password.",
    cannotConnect: "Cannot connect to backend",
    login: "Login",
    newHere: "New here?",
    createAccount: "Create account",
  },
  am: {
    title: "\u12a5\u1295\u12b3\u1295 \u12f0\u1205\u1293 \u1218\u1321",
    subtitle: "FuelFinder \u1208\u1218\u1240\u1320\u120d \u12ed\u130d\u1261",
    email: "\u12a2\u121c\u12ed\u120d",
    password: "\u12ed\u1208\u134d \u1243\u120d",
    requiredError: "\u12a2\u121c\u12ed\u120d \u12a5\u1293 \u12ed\u1208\u134d \u1243\u120d \u12eb\u1235\u1308\u1261\u1362",
    cannotConnect: "Backend \u130b\u122d \u1218\u1308\u1293\u1298\u1275 \u12a0\u120d\u1270\u127b\u1208\u121d",
    login: "\u130d\u1263",
    newHere: "\u12a0\u12f2\u1235 \u1290\u1205?",
    createAccount: "\u1218\u1208\u12eb \u134d\u1320\u122d",
  },
};

export default function LoginScreen({ navigation }) {
  const { signIn } = useAuth();
  const { language } = useLanguage();
  const t = useMemo(() => I18N[language] || I18N.en, [language]);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const onLogin = async () => {
    setError("");
    if (!email.trim() || !password) {
      setError(t.requiredError);
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
        setError(`${t.cannotConnect} (${API_BASE_URL}).`);
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
        <Text style={styles.title}>{t.title}</Text>
        <Text style={styles.subtitle}>{t.subtitle}</Text>

        <TextInput
          placeholder={t.email}
          value={email}
          onChangeText={setEmail}
          style={styles.input}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <TextInput
          placeholder={t.password}
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
            <Text style={styles.primaryBtnText}>{t.login}</Text>
          )}
        </Pressable>

        <View style={styles.row}>
          <Text style={styles.helper}>{t.newHere}</Text>
          <Pressable onPress={() => navigation.navigate("Register")}>
            <Text style={styles.link}> {t.createAccount}</Text>
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
