import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  ScrollView
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import * as Google from "expo-auth-session/providers/google";
import { useAuth } from "../../context/AuthContext";
import { useLanguage } from "../../context/LanguageContext";
import { API_BASE_URL } from "../../services/api";

WebBrowser.maybeCompleteAuthSession();

export default function LoginScreen({ navigation }) {
  const { signIn, signInWithGoogle } = useAuth();
  const { t } = useLanguage();

  const [email, setEmail] = useState("");
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
          setError(`${t("auth.login.cannotConnect")} (${API_BASE_URL}).`);
        }
      } finally {
        setGoogleLoading(false);
      }
    })();
  }, [navigation, response, signInWithGoogle, t]);

  const onLogin = async () => {
    setError("");
    if (!email.trim() || !password) {
      setError(t("auth.login.requiredError"));
      return;
    }

    setLoading(true);
    try {
      const result = await signIn({ email: email.trim(), password });
      if (result?.verificationRequired) {
        navigation.navigate("VerifyPhone", {
          verificationToken: result.verificationToken,
          phone: result?.user?.phone || "",
          email: email.trim(),
        });
      }
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

  const onGoogleLogin = async () => {
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

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >

        <ScrollView showsVerticalScrollIndicator={false}>

          {/* HEADER */}
          <View style={styles.header}>
            <Pressable style={styles.backBtn}>
              <Ionicons name="arrow-back" size={20} color="#000"/>
            </Pressable>

            <Pressable style={styles.profileBtn}>
              <Ionicons name="person-outline" size={22} color="#000"/>
            </Pressable>

            <Text style={styles.hello}>Hello</Text>
            <Text style={styles.welcome}>Welcome Back!</Text>
          </View>

          {/* LOGIN CARD */}
          <View style={styles.card}>

            <Text style={styles.cardTitle}>Login Account</Text>
            <Text style={styles.cardSubtitle}>
              Sign in to continue and access your personalized experience.
            </Text>

            <Text style={styles.label}>Email Address</Text>
            <TextInput
              placeholder="Your Email Address"
              value={email}
              onChangeText={setEmail}
              style={styles.input}
              autoCapitalize="none"
              keyboardType="email-address"
            />

            <Text style={styles.label}>Password</Text>
            <TextInput
              placeholder="********"
              value={password}
              onChangeText={setPassword}
              style={styles.input}
              secureTextEntry
            />

            {/* OPTIONS */}
            <View style={styles.optionRow}>
              <View style={styles.saveRow}>
                <View style={styles.checkbox}/>
                <Text style={styles.saveText}>Save Password</Text>
              </View>

              <Pressable>
                <Text style={styles.forgot}>Forgot Password?</Text>
              </Pressable>
            </View>

            {error ? <Text style={styles.error}>{error}</Text> : null}

            {/* LOGIN BUTTON */}
            <Pressable style={styles.loginBtn} onPress={onLogin} disabled={loading}>
              {loading ? (
                <ActivityIndicator color="#000"/>
              ) : (
                <Text style={styles.loginText}>Login Account</Text>
              )}
            </Pressable>

            {/* DIVIDER */}
            <View style={styles.dividerRow}>
              <View style={styles.line}/>
              <Text style={styles.or}>or</Text>
              <View style={styles.line}/>
            </View>

            {/* CREATE ACCOUNT */}
            <Pressable
              style={styles.createBtn}
              onPress={() => navigation.navigate("Register")}
            >
              <Text style={styles.createText}>Create New Account</Text>
            </Pressable>

            <Pressable
              style={styles.googleBtn}
              onPress={onGoogleLogin}
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

safeArea:{
flex:1,
backgroundColor:"#FFC107"
},

header:{
padding:20,
paddingBottom:30
},

backBtn:{
width:40,
height:40,
backgroundColor:"#fff",
borderRadius:10,
alignItems:"center",
justifyContent:"center",
marginBottom:10
},

profileBtn:{
position:"absolute",
right:20,
top:20,
width:40,
height:40,
backgroundColor:"#fff",
borderRadius:20,
alignItems:"center",
justifyContent:"center"
},

hello:{
fontSize:34,
fontWeight:"900",
marginTop:10
},

welcome:{
fontSize:16,
color:"#333"
},

card:{
backgroundColor:"#fff",
borderTopLeftRadius:35,
borderTopRightRadius:35,
padding:25,
minHeight:600
},

cardTitle:{
fontSize:20,
fontWeight:"800",
marginBottom:5
},

cardSubtitle:{
color:"#777",
fontSize:13,
marginBottom:20
},

label:{
fontSize:13,
color:"#777"
},

input:{
borderBottomWidth:1,
borderBottomColor:"#ddd",
paddingVertical:10,
marginBottom:15
},

optionRow:{
flexDirection:"row",
justifyContent:"space-between",
alignItems:"center",
marginBottom:20
},

saveRow:{
flexDirection:"row",
alignItems:"center"
},

checkbox:{
width:16,
height:16,
borderWidth:1,
borderColor:"#FFC107",
marginRight:6
},

saveText:{
fontSize:13,
color:"#777"
},

forgot:{
fontSize:13,
color:"#FFC107",
fontWeight:"600"
},

loginBtn:{
backgroundColor:"#FFC107",
padding:14,
borderRadius:30,
alignItems:"center",
marginBottom:20
},

loginText:{
fontWeight:"700",
fontSize:15
},

dividerRow:{
flexDirection:"row",
alignItems:"center",
marginBottom:20
},

line:{
flex:1,
height:1,
backgroundColor:"#ddd"
},

or:{
marginHorizontal:10,
color:"#777"
},

createBtn:{
borderWidth:1,
borderColor:"#FFC107",
borderRadius:25,
padding:14,
alignItems:"center"
},

createText:{
color:"#FFC107",
fontWeight:"700"
},

error:{
color:"red",
marginBottom:10
},

googleBtn:{
marginTop:12,
borderWidth:1,
borderColor:"#E2E8F0",
borderRadius:25,
padding:14,
alignItems:"center",
backgroundColor:"#F8FAFC"
},

googleText:{
color:"#111827",
fontWeight:"700"
}

});
