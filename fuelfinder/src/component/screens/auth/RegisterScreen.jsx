import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import * as WebBrowser from "expo-web-browser";
import * as Google from "expo-auth-session/providers/google";
import { useAuth } from "../../context/AuthContext";
import { useLanguage } from "../../context/LanguageContext";
import { API_BASE_URL } from "../../services/api";

WebBrowser.maybeCompleteAuthSession();

export default function RegisterScreen({ navigation }) {
  const { signUp, signInWithGoogle } = useAuth();
  const { language, changeLanguage, supportedLanguages, t } = useLanguage();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const googleConfig = useMemo(
    () => ({
      expoClientId: process.env.EXPO_PUBLIC_GOOGLE_EXPO_CLIENT_ID,
      iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
      androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
      webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
      scopes: ["profile", "email"],
      responseType: "id_token",
    }),
    []
  );

  const [request, response, promptAsync] = Google.useAuthRequest(googleConfig);

  useEffect(() => {
    if (response?.type !== "success") return;
    const idToken = response.params?.id_token;
    if (!idToken) {
      setError("Google sign-in failed. Missing id token.");
      return;
    }
    (async () => {
      setGoogleLoading(true);
      setError("");
      try {
        const result = await signInWithGoogle({ idToken });
        if (result?.verificationRequired) {
          navigation.navigate("VerifyPhone", {
            verificationToken: result.verificationToken,
            phone: result?.user?.phone || "",
            email: result?.user?.email || "",
          });
        }
      } catch (err) {
        const backendMessage = err?.response?.data?.message;
        if (backendMessage) {
          setError(backendMessage);
        } else {
          setError(`${t("auth.register.cannotConnect")} (${API_BASE_URL}).`);
        }
      } finally {
        setGoogleLoading(false);
      }
    })();
  }, [navigation, response, signInWithGoogle, t]);

  const [languageMenuOpen, setLanguageMenuOpen] = useState(false);
  const [languageQuery, setLanguageQuery] = useState("");

  const onRegister = async () => {
    setError("");
    if (!name.trim() || !email.trim() || !password || !phone.trim()) {
      setError(t("auth.register.requiredError"));
      return;
    }

    setLoading(true);
    try {
      const result = await signUp({
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        password,
      });
      if (result?.verificationRequired) {
        navigation.navigate("VerifyPhone", {
          verificationToken: result.verificationToken,
          phone: result?.user?.phone || phone.trim(),
          email: email.trim(),
        });
      }
    } catch (err) {
      const backendMessage = err?.response?.data?.message;
      if (backendMessage) {
        setError(backendMessage);
      } else {
        setError(`${t("auth.register.cannotConnect")} (${API_BASE_URL}).`);
      }
    } finally {
      setLoading(false);
    }
  };

  const onGoogleRegister = async () => {
    setError("");
    if (!request) {
      setError("Google sign-in is not ready. Check your client IDs.");
      return;
    }

    const useProxy =
      __DEV__ &&
      String(process.env.EXPO_PUBLIC_GOOGLE_USE_PROXY || "true").toLowerCase() === "true";
    await promptAsync({ useProxy });
  };

  // Language Picker
  const selectedLanguage = useMemo(() => {
    return supportedLanguages.find((l) => l.code === language) || supportedLanguages[0];
  }, [language, supportedLanguages]);

  const normalizedQuery = languageQuery.trim().toLowerCase();

  const groupedLanguages = useMemo(() => {
    const q = normalizedQuery;
    const matches = (l) => {
      if (!q) return true;
      const code = String(l.code || "").toLowerCase();
      const n = String(l.nativeName || "").toLowerCase();
      const e = String(l.englishName || "").toLowerCase();
      return code.includes(q) || n.includes(q) || e.includes(q);
    };

    const geezCodes = new Set(["am", "ti", "gez"]);
    const geez = [];
    const latin = [];

    for (const l of supportedLanguages) {
      if (!matches(l)) continue;
      if (geezCodes.has(l.code)) geez.push(l);
      else latin.push(l);
    }

    return [
      { key: "geez", title: t("auth.languagePicker.groupGeEz"), items: geez },
      { key: "latin", title: t("auth.languagePicker.groupLatin"), items: latin },
    ].filter((g) => g.items.length);
  }, [normalizedQuery, supportedLanguages, t]);

  const renderLanguageRow = (l) => {
    const active = language === l.code;
    return (
      <Pressable
        key={l.code}
        onPress={async () => {
          await changeLanguage(l.code);
          setLanguageMenuOpen(false);
          setLanguageQuery("");
        }}
        style={({ pressed }) => [
          styles.langRow,
          pressed && styles.langRowPressed,
          active && styles.langRowActive,
        ]}
      >
        <View style={styles.langRowLeft}>
          <Text style={styles.langRowTitle}>{l.nativeName}</Text>
          <Text style={styles.langRowSub}>
            {l.englishName} · {String(l.code).toUpperCase()}
          </Text>
        </View>
        {active ? (
          <Ionicons name="checkmark-circle" size={20} color="#0F766E" />
        ) : (
          <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
        )}
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView showsVerticalScrollIndicator={false}>

          {/* HEADER */}
          <View style={styles.header}>
            <Pressable style={styles.backBtn} onPress={() => navigation.goBack()}>
              <Ionicons name="arrow-back" size={20} color="#000" />
            </Pressable>

            <Pressable style={styles.profileBtn}>
              <Ionicons name="person-outline" size={22} color="#000" />
            </Pressable>

            <Text style={styles.hello}>Join Us</Text>
            <Text style={styles.welcome}>Create Free Account</Text>
          </View>

          {/* LANGUAGE PICKER BUTTON */}
          <Pressable
            onPress={() => setLanguageMenuOpen(true)}
            style={styles.langMenu}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Ionicons name="language-outline" size={18} color="#0F172A" />
              <Text style={{ color: "#0F172A", fontWeight: "900" }}>{t("auth.languageLabel")}</Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text style={{ color: "#334155", fontWeight: "800" }}>{selectedLanguage?.nativeName}</Text>
              <Ionicons name="chevron-down" size={18} color="#64748B" />
            </View>
          </Pressable>

          {/* LANGUAGE MODAL */}
          <Modal
            visible={languageMenuOpen}
            transparent
            animationType="fade"
            onRequestClose={() => setLanguageMenuOpen(false)}
          >
            <Pressable style={styles.modalBackdrop} onPress={() => setLanguageMenuOpen(false)}>
              <Pressable style={styles.modalCard} onPress={() => {}}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>{t("auth.languagePicker.title")}</Text>
                  <Pressable
                    onPress={() => setLanguageMenuOpen(false)}
                    style={styles.modalClose}
                  >
                    <Text style={styles.modalCloseText}>{t("auth.languagePicker.close")}</Text>
                  </Pressable>
                </View>

                <View style={styles.searchWrap}>
                  <Ionicons name="search-outline" size={18} color="#64748B" />
                  <TextInput
                    value={languageQuery}
                    onChangeText={setLanguageQuery}
                    placeholder={t("auth.languagePicker.searchPlaceholder")}
                    placeholderTextColor="#94A3B8"
                    style={styles.searchInput}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  {languageQuery ? (
                    <Pressable onPress={() => setLanguageQuery("")} style={styles.searchClear}>
                      <Ionicons name="close-circle" size={18} color="#94A3B8" />
                    </Pressable>
                  ) : null}
                </View>

                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.modalContent}>
                  {groupedLanguages.map((g) => (
                    <View key={g.key} style={styles.groupBlock}>
                      <Text style={styles.groupTitle}>{g.title}</Text>
                      <View style={styles.groupCard}>
                        {g.items.map(renderLanguageRow)}
                      </View>
                    </View>
                  ))}
                </ScrollView>
              </Pressable>
            </Pressable>
          </Modal>

          {/* REGISTER CARD */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Register Account</Text>
            <Text style={styles.cardSubtitle}>
              Create your account to access fuel stations and join queues faster.
            </Text>

            <Text style={styles.label}>Full Name</Text>
            <TextInput
              placeholder="Your Full Name"
              value={name}
              onChangeText={setName}
              style={styles.input}
            />

            <Text style={styles.label}>Email Address</Text>
            <TextInput
              placeholder="Your Email Address"
              value={email}
              onChangeText={setEmail}
              style={styles.input}
              autoCapitalize="none"
              keyboardType="email-address"
            />

            <Text style={styles.label}>Phone</Text>
            <TextInput
              placeholder="Phone Number"
              value={phone}
              onChangeText={setPhone}
              style={styles.input}
              keyboardType="phone-pad"
            />

            <Text style={styles.label}>Password</Text>
            <TextInput
              placeholder="********"
              value={password}
              onChangeText={setPassword}
              style={styles.input}
              secureTextEntry
            />

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Pressable
              style={styles.loginBtn}
              onPress={onRegister}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#000" />
              ) : (
                <Text style={styles.loginText}>Create Account</Text>
              )}
            </Pressable>

            <View style={styles.dividerRow}>
              <View style={styles.line} />
              <Text style={styles.or}>or</Text>
              <View style={styles.line} />
            </View>

            <Pressable
              style={styles.createBtn}
              onPress={() => navigation.navigate("Login")}
            >
              <Text style={styles.createText}>Already have account? Login</Text>
            </Pressable>

            <Pressable
              style={styles.googleBtn}
              onPress={onGoogleRegister}
              disabled={googleLoading}
            >
              {googleLoading ? (
                <ActivityIndicator color="#000" />
              ) : (
                <Text style={styles.googleText}>Continue with Google</Text>
              )}
            </Pressable>
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#FFC107" },
  header: { padding: 20, paddingBottom: 30 },
  backBtn: { width: 40, height: 40, backgroundColor: "#fff", borderRadius: 10, alignItems: "center", justifyContent: "center", marginBottom: 10 },
  profileBtn: { position: "absolute", right: 20, top: 20, width: 40, height: 40, backgroundColor: "#fff", borderRadius: 20, alignItems: "center", justifyContent: "center" },
  hello: { fontSize: 34, fontWeight: "900", marginTop: 10 },
  welcome: { fontSize: 16, color: "#333" },
  card: { backgroundColor: "#fff", borderTopLeftRadius: 35, borderTopRightRadius: 35, padding: 25, minHeight: 650 },
  cardTitle: { fontSize: 20, fontWeight: "800", marginBottom: 5 },
  cardSubtitle: { color: "#777", fontSize: 13, marginBottom: 20 },
  label: { fontSize: 13, color: "#777" },
  input: { borderBottomWidth: 1, borderBottomColor: "#ddd", paddingVertical: 10, marginBottom: 15 },
  loginBtn: { backgroundColor: "#FFC107", padding: 14, borderRadius: 30, alignItems: "center", marginTop: 10, marginBottom: 20 },
  loginText: { fontWeight: "700", fontSize: 15 },
  dividerRow: { flexDirection: "row", alignItems: "center", marginBottom: 20 },
  line: { flex: 1, height: 1, backgroundColor: "#ddd" },
  or: { marginHorizontal: 10, color: "#777" },
  createBtn: { borderWidth: 1, borderColor: "#FFC107", borderRadius: 25, padding: 14, alignItems: "center" },
  createText: { color: "#FFC107", fontWeight: "700" },
  error: { color: "red", marginBottom: 10 },

  /* LANGUAGE PICKER STYLES */
  langMenu: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(15, 23, 42, 0.55)", padding: 18, justifyContent: "center" },
  modalCard: { backgroundColor: "#FFFFFF", borderRadius: 16, borderWidth: 1, borderColor: "#E2E8F0", overflow: "hidden", maxHeight: "85%" },
  modalHeader: { paddingHorizontal: 14, paddingTop: 14, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: "#EEF2F6", flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  modalTitle: { fontSize: 16, fontWeight: "900", color: "#0F172A" },
  modalClose: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10, backgroundColor: "#F1F5F9" },
  modalCloseText: { fontWeight: "900", color: "#0F172A", fontSize: 12 },
  searchWrap: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#EEF2F6" },
  searchInput: { flex: 1, paddingVertical: 8, fontWeight: "800", color: "#0F172A" },
  searchClear: { padding: 6 },
  modalContent: { padding: 12, paddingBottom: 16 },
  groupBlock: { marginBottom: 12 },
  groupTitle: { fontSize: 12, fontWeight: "900", color: "#0F172A", letterSpacing: 0.7, textTransform: "uppercase", marginBottom: 8 },
  groupCard: { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 14, overflow: "hidden" },
  langRow: { paddingHorizontal: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#EEF2F6", flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  langRowPressed: { backgroundColor: "#F8FAFC" },
  langRowActive: { backgroundColor: "#ECFDF5" },
  langRowLeft: { flex: 1 },
  langRowTitle: { fontWeight: "900", color: "#0F172A" },
  langRowSub: { marginTop: 2, color: "#64748B", fontWeight: "700", fontSize: 12 },

  googleBtn: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 25,
    padding: 14,
    alignItems: "center",
    backgroundColor: "#F8FAFC",
  },
  googleText: { color: "#111827", fontWeight: "700" },
});
