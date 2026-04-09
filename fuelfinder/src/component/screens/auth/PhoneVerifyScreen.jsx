import React, { useEffect, useState } from "react";
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

export default function PhoneVerifyScreen({ navigation, route }) {
  const {
    confirmPhoneOtp,
    confirmPasswordResetOtp,
    resendPhoneVerification,
    resendPasswordResetCode,
    confirmTwoFactorOtp,
    resendTwoFactorCode,
  } = useAuth();
  const { t } = useLanguage();

  const [verificationToken, setVerificationToken] = useState(
    route?.params?.verificationToken || ""
  );
  const phone = route?.params?.phone || "";
  const email = route?.params?.email || "";
  const emailVerificationSent = route?.params?.emailVerificationSent;
  const emailVerificationMessage = String(route?.params?.emailVerificationMessage || "").trim();
  const flowType = route?.params?.flowType || "phone_verification";
  const isTwoFactorFlow = flowType === "two_factor";
  const isPasswordResetFlow = flowType === "password_reset";
  const showEmailVerificationWarning =
    !isTwoFactorFlow &&
    !isPasswordResetFlow &&
    emailVerificationSent === false;

  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (!verificationToken) {
      setError("Missing verification token. Please login again.");
    }
  }, [verificationToken]);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const id = setInterval(() => {
      setCooldown((c) => (c > 1 ? c - 1 : 0));
    }, 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  const onVerify = async () => {
    setError("");
    if (!otp.trim()) {
      setError("Enter the verification code.");
      return;
    }
    if (!verificationToken) {
      setError("Missing verification token. Please login again.");
      return;
    }

    setLoading(true);
    try {
      if (isTwoFactorFlow) {
        await confirmTwoFactorOtp({ verificationToken, otpCode: otp.trim() });
      } else if (isPasswordResetFlow) {
        const data = await confirmPasswordResetOtp({
          verificationToken,
          otpCode: otp.trim(),
        });
        if (!data?.resetToken) {
          setError("Reset token missing. Please request another code.");
          return;
        }
        navigation.replace("ResetPassword", {
          resetToken: data?.resetToken || "",
          phone: data?.maskedPhone || phone || "",
          email: data?.email || email || "",
        });
      } else {
        await confirmPhoneOtp({ verificationToken, otpCode: otp.trim() });
      }
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

  const onResend = async () => {
    setError("");
    if (!verificationToken) {
      setError("Missing verification token. Please login again.");
      return;
    }
    setResending(true);
    try {
      const data =
        isTwoFactorFlow
          ? await resendTwoFactorCode({ verificationToken })
          : isPasswordResetFlow
            ? await resendPasswordResetCode({ verificationToken })
          : await resendPhoneVerification({ verificationToken });
      if (data?.verificationToken) {
        setVerificationToken(data.verificationToken);
      }
      const nextCooldown = Number(data?.resendCooldownSeconds || 0);
      if (nextCooldown > 0) setCooldown(nextCooldown);
    } catch (err) {
      const status = err?.response?.status;
      const backendMessage = err?.response?.data?.message;
      if (status === 429) {
        const retryAfter = Number(err?.response?.data?.retryAfterSeconds || 0);
        if (retryAfter > 0) setCooldown(retryAfter);
      }
      if (backendMessage) {
        setError(backendMessage);
      } else {
        setError(`${t("somethingWentWrong")} (${API_BASE_URL}).`);
      }
    } finally {
      setResending(false);
    }
  };

  const maskedTarget = phone || email || "";

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
            <Text style={styles.hello}>
              {isTwoFactorFlow
                ? "Security Check"
                : isPasswordResetFlow
                  ? "Reset Password"
                  : "Verify Phone"}
            </Text>
            <Text style={styles.welcome}>
              {maskedTarget
                ? `We sent a code to ${maskedTarget}`
                : isTwoFactorFlow
                  ? "Enter the security code we sent to your phone."
                  : isPasswordResetFlow
                    ? "Enter the reset code we sent to your verified phone."
                  : "Enter the code we sent to your phone."}
            </Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>
              {isTwoFactorFlow
                ? "Enter Security Code"
                : isPasswordResetFlow
                  ? "Enter Reset Code"
                  : "Enter Verification Code"}
            </Text>
            <Text style={styles.cardSubtitle}>
              {isTwoFactorFlow
                ? "Use the 6-digit code to finish signing in securely."
                : isPasswordResetFlow
                  ? "Use the 6-digit code before creating your new password."
                : "Use the 6-digit code to finish setting up your account."}
            </Text>

            {showEmailVerificationWarning ? (
              <View style={styles.infoBanner}>
                <Ionicons name="mail-unread-outline" size={18} color="#92400E" />
                <Text style={styles.infoBannerText}>
                  {emailVerificationMessage ||
                    "We could not send your email verification link yet. Finish phone verification first, then resend the email from your profile."}
                </Text>
              </View>
            ) : null}

            <Text style={styles.label}>
              {isTwoFactorFlow
                ? "Security Code"
                : isPasswordResetFlow
                  ? "Reset Code"
                  : "Verification Code"}
            </Text>
            <TextInput
              placeholder="123456"
              value={otp}
              onChangeText={setOtp}
              style={styles.input}
              keyboardType="number-pad"
              maxLength={6}
            />

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Pressable style={styles.loginBtn} onPress={onVerify} disabled={loading}>
              {loading ? (
                <ActivityIndicator color="#000" />
              ) : (
                  <Text style={styles.loginText}>
                    {isTwoFactorFlow || isPasswordResetFlow ? "Continue" : "Verify"}
                  </Text>
                )}
            </Pressable>

            <View style={styles.resendRow}>
              <Text style={styles.resendHint}>
                Didn't receive the code?
              </Text>
              <Pressable
                onPress={onResend}
                disabled={resending || cooldown > 0}
                style={({ pressed }) => [
                  styles.resendBtn,
                  (resending || cooldown > 0) && styles.resendBtnDisabled,
                  pressed && !resending && cooldown === 0 && styles.resendBtnPressed,
                ]}
              >
                {resending ? (
                  <ActivityIndicator color="#FFC107" />
                ) : (
                  <Text style={styles.resendText}>
                    {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#FFC107" },
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
  hello: { fontSize: 34, fontWeight: "900", marginTop: 10 },
  welcome: { fontSize: 16, color: "#333" },
  card: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 35,
    borderTopRightRadius: 35,
    padding: 25,
    minHeight: 520,
  },
  cardTitle: { fontSize: 20, fontWeight: "800", marginBottom: 5 },
  cardSubtitle: { color: "#777", fontSize: 13, marginBottom: 20 },
  infoBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: "#FEF3C7",
    borderWidth: 1,
    borderColor: "#FCD34D",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 16,
  },
  infoBannerText: {
    flex: 1,
    color: "#92400E",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
  },
  label: { fontSize: 13, color: "#777" },
  input: { borderBottomWidth: 1, borderBottomColor: "#ddd", paddingVertical: 10, marginBottom: 15 },
  loginBtn: {
    backgroundColor: "#FFC107",
    padding: 14,
    borderRadius: 30,
    alignItems: "center",
    marginBottom: 20,
  },
  loginText: { fontWeight: "700", fontSize: 15 },
  error: { color: "red", marginBottom: 10 },
  resendRow: { alignItems: "center", gap: 8 },
  resendHint: { color: "#777", fontSize: 13 },
  resendBtn: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: "#FFC107" },
  resendBtnDisabled: { opacity: 0.6 },
  resendBtnPressed: { backgroundColor: "#FFF3C4" },
  resendText: { color: "#FFC107", fontWeight: "700" },
});
