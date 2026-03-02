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
    title: "Create Account",
    subtitle: "Register and start using FuelFinder",
    fullName: "Full name",
    email: "Email",
    phoneOptional: "Phone (optional)",
    password: "Password",
    passwordHint: "Password: 8+ chars with upper/lower/number/special.",
    requiredError: "Name, email and password are required.",
    cannotConnect: "Cannot connect to backend",
    createAccount: "Create Account",
    alreadyHave: "Already have an account?",
    login: "Login",
  },
  am: {
    title: "\u1218\u1208\u12eb \u134d\u1320\u122d",
    subtitle: "FuelFinder \u1218\u1320\u1240\u121d \u1208\u1218\u1300\u1218\u122d \u12ed\u1218\u12dd\u1308\u1261",
    fullName: "\u1219\u1209 \u1235\u121d",
    email: "\u12a2\u121c\u12ed\u120d",
    phoneOptional: "\u1235\u120d\u12ad (\u12a0\u121b\u122b\u132d)",
    password: "\u12ed\u1208\u134d \u1243\u120d",
    passwordHint: "\u12ed\u1208\u134d \u1243\u120d: 8+ \u134a\u12f0\u120d \u12a8\u134a\u12f0\u120d \u120d\u12e9\u1290\u1275, \u1241\u1325\u122d \u12a5\u1293 \u120d\u12e9 \u121d\u120d\u12ad\u1275 \u130b\u122d\u1362",
    requiredError: "\u1235\u121d\u1363 \u12a2\u121c\u12ed\u120d \u12a5\u1293 \u12ed\u1208\u134d \u1243\u120d \u12eb\u1235\u1348\u120d\u130b\u120d\u1362",
    cannotConnect: "Backend \u130b\u122d \u1218\u1308\u1293\u1298\u1275 \u12a0\u120d\u1270\u127b\u1208\u121d",
    createAccount: "\u1218\u1208\u12eb \u134d\u1320\u122d",
    alreadyHave: "\u1240\u12f0\u121d \u1232\u120d \u1218\u1208\u12eb \u12a0\u1208\u12ce\u1275?",
    login: "\u130d\u1263",
  },
};

export default function RegisterScreen({ navigation }) {
  const { signUp } = useAuth();
  const { language } = useLanguage();
  const t = useMemo(() => I18N[language] || I18N.en, [language]);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const onRegister = async () => {
    setError("");
    if (!name.trim() || !email.trim() || !password) {
      setError(t.requiredError);
      return;
    }

    setLoading(true);
    try {
      await signUp({
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        password,
      });
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
          placeholder={t.fullName}
          value={name}
          onChangeText={setName}
          style={styles.input}
        />
        <TextInput
          placeholder={t.email}
          value={email}
          onChangeText={setEmail}
          style={styles.input}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <TextInput
          placeholder={t.phoneOptional}
          value={phone}
          onChangeText={setPhone}
          style={styles.input}
          keyboardType="phone-pad"
        />
        <TextInput
          placeholder={t.password}
          value={password}
          onChangeText={setPassword}
          style={styles.input}
          secureTextEntry
        />
        <Text style={styles.hint}>{t.passwordHint}</Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable style={styles.primaryBtn} onPress={onRegister} disabled={loading}>
          {loading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.primaryBtnText}>{t.createAccount}</Text>
          )}
        </Pressable>

        <View style={styles.row}>
          <Text style={styles.helper}>{t.alreadyHave}</Text>
          <Pressable onPress={() => navigation.navigate("Login")}>
            <Text style={styles.link}> {t.login}</Text>
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
  hint: { color: "#64748B", fontSize: 12, marginBottom: 8, fontWeight: "600" },
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
