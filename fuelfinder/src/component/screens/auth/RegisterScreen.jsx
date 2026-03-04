import React, { useMemo, useState } from "react";
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
import { useAuth } from "../../context/AuthContext";
import { useLanguage } from "../../context/LanguageContext";
import { API_BASE_URL } from "../../services/api";

export default function RegisterScreen({ navigation }) {
  const { signUp } = useAuth();
  const { language, changeLanguage, supportedLanguages, t } = useLanguage();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [languageMenuOpen, setLanguageMenuOpen] = useState(false);
  const [languageQuery, setLanguageQuery] = useState("");

  const onRegister = async () => {
    setError("");
    if (!name.trim() || !email.trim() || !password) {
      setError(t("auth.register.requiredError"));
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
        setError(`${t("auth.register.cannotConnect")} (${API_BASE_URL}).`);
      }
    } finally {
      setLoading(false);
    }
  };

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
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Text style={styles.title}>{t("auth.register.title")}</Text>
        <Text style={styles.subtitle}>{t("auth.register.subtitle")}</Text>

        <Pressable
          onPress={() => setLanguageMenuOpen(true)}
          style={({ pressed }) => [styles.langMenu, pressed && styles.langMenuPressed]}
          accessibilityRole="button"
        >
          <View style={styles.langMenuLeft}>
            <Ionicons name="language-outline" size={18} color="#0F172A" />
            <Text style={styles.langMenuLabel}>{t("auth.languageLabel")}</Text>
          </View>
          <View style={styles.langMenuRight}>
            <Text style={styles.langMenuValue} numberOfLines={1}>
              {selectedLanguage?.nativeName || language}
            </Text>
            <Ionicons name="chevron-down" size={18} color="#64748B" />
          </View>
        </Pressable>

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
                  accessibilityRole="button"
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

        <TextInput
          placeholder={t("auth.register.fullName")}
          value={name}
          onChangeText={setName}
          style={styles.input}
        />
        <TextInput
          placeholder={t("auth.register.email")}
          value={email}
          onChangeText={setEmail}
          style={styles.input}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <TextInput
          placeholder={t("auth.register.phoneOptional")}
          value={phone}
          onChangeText={setPhone}
          style={styles.input}
          keyboardType="phone-pad"
        />
        <TextInput
          placeholder={t("auth.register.password")}
          value={password}
          onChangeText={setPassword}
          style={styles.input}
          secureTextEntry
        />
        <Text style={styles.hint}>{t("auth.register.passwordHint")}</Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable style={styles.primaryBtn} onPress={onRegister} disabled={loading}>
          {loading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.primaryBtnText}>{t("auth.register.button")}</Text>
          )}
        </Pressable>

        <View style={styles.row}>
          <Text style={styles.helper}>{t("auth.register.alreadyHave")}</Text>
          <Pressable onPress={() => navigation.navigate("Login")}>
            <Text style={styles.link}> {t("auth.register.login")}</Text>
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
  langMenuPressed: { opacity: 0.9 },
  langMenuLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  langMenuLabel: { color: "#0F172A", fontWeight: "900" },
  langMenuRight: { flexDirection: "row", alignItems: "center", gap: 8, maxWidth: "55%" },
  langMenuValue: { color: "#334155", fontWeight: "800" },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.55)",
    padding: 18,
    justifyContent: "center",
  },
  modalCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    overflow: "hidden",
    maxHeight: "85%",
  },
  modalHeader: {
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#EEF2F6",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  modalTitle: { fontSize: 16, fontWeight: "900", color: "#0F172A" },
  modalClose: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: "#F1F5F9",
  },
  modalCloseText: { fontWeight: "900", color: "#0F172A", fontSize: 12 },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#EEF2F6",
  },
  searchInput: {
    flex: 1,
    paddingVertical: 8,
    fontWeight: "800",
    color: "#0F172A",
  },
  searchClear: { padding: 6 },
  modalContent: { padding: 12, paddingBottom: 16 },
  groupBlock: { marginBottom: 12 },
  groupTitle: {
    fontSize: 12,
    fontWeight: "900",
    color: "#0F172A",
    letterSpacing: 0.7,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  groupCard: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 14,
    overflow: "hidden",
  },
  langRow: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#EEF2F6",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  langRowPressed: { backgroundColor: "#F8FAFC" },
  langRowActive: { backgroundColor: "#ECFDF5" },
  langRowLeft: { flex: 1 },
  langRowTitle: { fontWeight: "900", color: "#0F172A" },
  langRowSub: { marginTop: 2, color: "#64748B", fontWeight: "700", fontSize: 12 },
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
