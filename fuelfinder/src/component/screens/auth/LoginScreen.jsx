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
  ScrollView,
  Modal
} from "react-native";

import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import * as WebBrowser from "expo-web-browser";
import { makeRedirectUri } from "expo-auth-session";
import * as Google from "expo-auth-session/providers/google";
import { useFocusEffect } from "@react-navigation/native";

import { GoogleAuthProvider, signInWithCredential } from "firebase/auth";

import { useAuth } from "../../context/AuthContext";
import { useLanguage } from "../../context/LanguageContext";

import { API_BASE_URL } from "../../services/api";
import {
  clearBiometricLoginCredential,
  loadBiometricLoginCredential,
  loadBiometricLoginMeta,
} from "../../services/biometricService";
import { firebaseAuth } from "../../services/firebase";
import i18n from "../../../i18n/i18n";
WebBrowser.maybeCompleteAuthSession();

export default function LoginScreen({ navigation, route }) {

const { signIn, signInWithGoogle, signInWithBiometric } = useAuth();
const { language, changeLanguage, supportedLanguages, t } = useLanguage();

const [email,setEmail]=useState("");
const [password,setPassword]=useState("");
const [showPassword,setShowPassword]=useState(false);

const [error,setError]=useState("");
const [loading,setLoading]=useState(false);
const [googleLoading,setGoogleLoading]=useState(false);
const [biometricLoading,setBiometricLoading]=useState(false);
const [biometricMeta,setBiometricMeta]=useState(null);

const [languageMenuOpen,setLanguageMenuOpen]=useState(false);
const [languageQuery,setLanguageQuery]=useState("");

useEffect(()=>{
if(route?.params?.email){
setEmail(String(route.params.email || ""));
}
},[route?.params?.email]);

useFocusEffect(
useMemo(()=>()=>{
let mounted = true;

(async()=>{
try{
const meta = await loadBiometricLoginMeta();
if(mounted){
setBiometricMeta(meta);
}
}catch(_error){
if(mounted){
setBiometricMeta(null);
}
}
})();

return()=>{
mounted = false;
};
},[])
);

/* GOOGLE CONFIG */

const googleConfig = useMemo(()=>{

const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;

const redirectUri = makeRedirectUri({
useProxy:true,
projectNameForProxy:"@mintesenotbizuayehw/fuelfinder"
});

return{
clientId:webClientId,
webClientId,
scopes:["profile","email"],
responseType:"id_token",
redirectUri
};

},[]);

const [request,response,promptAsync] =
Google.useAuthRequest(googleConfig,{
useProxy:true,
projectNameForProxy:"@mintesenotbizuayehw/fuelfinder"
});

/* GOOGLE LOGIN */

useEffect(()=>{

if(response?.type !== "success") return;

const idToken = response.params?.id_token;

if(!idToken){
setError(t("auth.googleFailed"));
return;
}

(async()=>{

setGoogleLoading(true);
setError("");

try{

const credential =
GoogleAuthProvider.credential(idToken);

const firebaseUser =
await signInWithCredential(firebaseAuth,credential);

const firebaseIdToken =
await firebaseUser.user.getIdToken();

const result =
await signInWithGoogle({ idToken:firebaseIdToken });

if(result?.verificationRequired){

navigation.navigate("VerifyPhone",{
verificationToken:result.verificationToken,
phone:result?.user?.phone || "",
email:result?.user?.email || ""
});

}

if(result?.twoFactorRequired){

navigation.navigate("VerifyPhone",{
verificationToken:result.verificationToken,
phone:result?.user?.phone || "",
email:result?.user?.email || "",
flowType:"two_factor"
});

}

}catch(err){

const backendMessage = err?.response?.data?.message;

if(backendMessage){
setError(backendMessage);
}else{
setError(`${t("auth.login.cannotConnect")} (${API_BASE_URL})`);
}

}finally{
setGoogleLoading(false);
}

})();

},[response]);

/* LOGIN */

const onLogin = async()=>{

setError("");

if(!email.trim() || !password){

setError(t("auth.login.requiredError"));
return;

}

setLoading(true);

try{

const result = await signIn({
email:email.trim(),
password
});

if(result?.verificationRequired){

navigation.navigate("VerifyPhone",{
verificationToken:result.verificationToken,
phone:result?.user?.phone || "",
email:email.trim()
});

}

if(result?.twoFactorRequired){

navigation.navigate("VerifyPhone",{
verificationToken:result.verificationToken,
phone:result?.user?.phone || "",
email:email.trim(),
flowType:"two_factor"
});

}

}catch(err){

const backendMessage = err?.response?.data?.message;

if(backendMessage){
setError(backendMessage);
}else{
setError(`${t("auth.login.cannotConnect")} (${API_BASE_URL})`);
}

}finally{
setLoading(false);
}

};

const onBiometricLogin = async()=>{

setError("");
setBiometricLoading(true);

try{

const credential = await loadBiometricLoginCredential();

if(!credential?.deviceId || !credential?.biometricSecret){
await clearBiometricLoginCredential();
setBiometricMeta(null);
setError(t("biometricMissingCredential",{defaultValue:"Biometric login is not available on this device anymore."}));
return;
}

await signInWithBiometric({
deviceId:credential.deviceId,
biometricSecret:credential.biometricSecret
});

}catch(err){

const backendMessage = err?.response?.data?.message;

if(err?.message?.toLowerCase?.().includes("authentication")){
setError(t("biometricCanceled",{defaultValue:"Biometric authentication was canceled."}));
}else if(backendMessage){
if(
backendMessage.includes("Biometric login is not available") ||
backendMessage.includes("Biometric login failed")
){
await clearBiometricLoginCredential();
setBiometricMeta(null);
}
setError(backendMessage);
}else{
setError(t("biometricLoginFailed",{defaultValue:"Biometric login failed. Please try your password instead."}));
}

}finally{
setBiometricLoading(false);
}

};

/* GOOGLE BUTTON */

const onGoogleLogin = async()=>{

setError("");

if(!request){
setError(t("auth.googleNotReady"));
return;
}

await promptAsync({ useProxy:true });

};

/* LANGUAGE SELECT */

const selectedLanguage = useMemo(()=>{

return supportedLanguages.find(l=>l.code===language)
|| supportedLanguages[0];

},[language]);

const filteredLanguages = useMemo(()=>{

if(!languageQuery) return supportedLanguages;

const q = languageQuery.toLowerCase();

return supportedLanguages.filter(l=>
l.nativeName.toLowerCase().includes(q) ||
l.englishName.toLowerCase().includes(q) ||
l.code.includes(q)
);

},[languageQuery]);

/* UI */

return(

<SafeAreaView style={styles.safeArea}>

<KeyboardAvoidingView
style={{flex:1}}
behavior={Platform.OS==="ios"?"padding":undefined}
>

<ScrollView showsVerticalScrollIndicator={false}>

{/* HEADER */}

<View style={styles.header}>

<Pressable
style={styles.backBtn}
onPress={()=>navigation.goBack()}
>
<Ionicons name="arrow-back" size={20}/>
</Pressable>

 <Text style={styles.hello}>
 {t("auth.login.title")}
 </Text>
 
 <Text style={styles.welcome}>
 {t("auth.login.subtitle")}
 </Text>

</View>

{/* LANGUAGE PICKER */}

<Pressable
style={styles.langMenu}
onPress={()=>setLanguageMenuOpen(true)}
>

<View style={{flexDirection:"row",alignItems:"center",gap:8}}>
<Ionicons name="language-outline" size={18}/>
<Text style={{fontWeight:"900"}}>
{t("auth.languageLabel")}
</Text>
</View>

<View style={{flexDirection:"row",alignItems:"center",gap:6}}>
<Text style={{fontWeight:"800"}}>
{selectedLanguage.nativeName}
</Text>
<Ionicons name="chevron-down"/>
</View>

</Pressable>

{/* LANGUAGE MODAL */}

<Modal
visible={languageMenuOpen}
transparent
animationType="fade"
>

<Pressable
style={styles.modalBackdrop}
onPress={()=>setLanguageMenuOpen(false)}
>

<View style={styles.modalCard}>

<Text style={styles.modalTitle}>
{t("auth.languagePicker.title")}
</Text>

<TextInput
placeholder={t("auth.languagePicker.searchPlaceholder")}
value={languageQuery}
onChangeText={setLanguageQuery}
style={styles.searchInput}
/>

<ScrollView>

{filteredLanguages.map(lang=>(

<Pressable
key={lang.code}
style={styles.langRow}
onPress={()=>{
changeLanguage(lang.code);
setLanguageMenuOpen(false);
}}
>

<Text style={styles.langRowTitle}>
{lang.nativeName}
</Text>

<Text style={styles.langRowSub}>
{lang.englishName}
</Text>

</Pressable>

))}

</ScrollView>

</View>

</Pressable>

</Modal>

{/* CARD */}

<View style={styles.card}>

 <Text style={styles.cardTitle}>
 {t("auth.login.button")}
 </Text>
 
 <Text style={styles.cardSubtitle}>
 {t("auth.login.subtitle")}
 </Text>
 
 <Text style={styles.label}>
 {t("auth.login.email")}
 </Text>

 <TextInput
 placeholder={t("auth.login.email")}
 value={email}
 onChangeText={setEmail}
 style={styles.input}
 />
 
 <Text style={styles.label}>
 {t("auth.login.password")}
 </Text>

<View style={styles.passwordContainer}>

<TextInput
placeholder="********"
value={password}
onChangeText={setPassword}
secureTextEntry={!showPassword}
style={styles.passwordInput}
/>

<Pressable onPress={()=>setShowPassword(!showPassword)}>
<Ionicons
name={showPassword ? "eye-off-outline":"eye-outline"}
size={22}
color="#777"
/>
</Pressable>

</View>

<Pressable
style={styles.forgotBtn}
onPress={()=>navigation.navigate("ForgotPassword",{ email })}
>
<Text style={styles.forgotText}>
Forgot Password?
</Text>
</Pressable>

{error ? <Text style={styles.error}>{error}</Text> : null}

{biometricMeta ? (
<Pressable
style={styles.biometricBtn}
onPress={onBiometricLogin}
disabled={biometricLoading}
>
{biometricLoading
? <ActivityIndicator color="#0F766E"/>
: <>
<Ionicons name="finger-print-outline" size={20} color="#0F766E"/>
<View style={styles.biometricTextWrap}>
<Text style={styles.biometricText}>
{t("biometricLoginCta",{defaultValue:"Use biometric login"})}
</Text>
<Text style={styles.biometricSubText}>
{biometricMeta?.email || biometricMeta?.displayName || t("profile")}
</Text>
</View>
</>
}
</Pressable>
) : null}

<Pressable
style={styles.loginBtn}
onPress={onLogin}
>

{loading
? <ActivityIndicator color="#000"/>
 : <Text style={styles.loginText}>
 {t("auth.login.button")}
 </Text>
 }

</Pressable>

<View style={styles.dividerRow}>
<View style={styles.line}/>
<Text style={styles.or}>or</Text>
<View style={styles.line}/>
</View>

<Pressable
style={styles.createBtn}
onPress={()=>navigation.navigate("Register")}
>
<Text style={styles.createText}>
{t("auth.login.createAccount")}
</Text>
</Pressable>

<Pressable
style={styles.googleBtn}
onPress={onGoogleLogin}
>

{googleLoading
? <ActivityIndicator/>
: <Text style={styles.googleText}>
{t("auth.google")}
</Text>
}

</Pressable>

</View>

</ScrollView>

</KeyboardAvoidingView>

</SafeAreaView>

);

}

/* STYLES */

const styles = StyleSheet.create({

safeArea:{flex:1,backgroundColor:"#0F766E"},

header:{padding:20},

backBtn:{
width:40,
height:40,
backgroundColor:"#fff",
borderRadius:10,
alignItems:"center",
justifyContent:"center",
marginBottom:10
},

hello:{fontSize:34,fontWeight:"900"},
welcome:{fontSize:16,color:"#333"},

langMenu:{
backgroundColor:"#fff",
borderRadius:12,
padding:12,
marginHorizontal:20,
marginBottom:15,
flexDirection:"row",
justifyContent:"space-between"
},

modalBackdrop:{
flex:1,
backgroundColor:"rgba(0,0,0,0.4)",
justifyContent:"center",
padding:20
},

modalCard:{
backgroundColor:"#fff",
borderRadius:16,
padding:16,
maxHeight:"80%"
},

modalTitle:{fontSize:16,fontWeight:"900",marginBottom:10},

searchInput:{
borderWidth:1,
borderColor:"#ddd",
borderRadius:8,
padding:8,
marginBottom:10
},

langRow:{
paddingVertical:12,
borderBottomWidth:1,
borderColor:"#eee"
},

langRowTitle:{fontWeight:"900"},
langRowSub:{fontSize:12,color:"#777"},

card:{
backgroundColor:"#fff",
borderTopLeftRadius:35,
borderTopRightRadius:35,
padding:25,
minHeight:650
},

cardTitle:{fontSize:20,fontWeight:"800"},
cardSubtitle:{color:"#777",marginBottom:20},

label:{fontSize:13,color:"#777"},

input:{
borderBottomWidth:1,
borderBottomColor:"#ddd",
marginBottom:15
},

passwordContainer:{
flexDirection:"row",
alignItems:"center",
borderBottomWidth:1,
borderBottomColor:"#ddd",
marginBottom:15
},

passwordInput:{flex:1},

forgotBtn:{
alignSelf:"flex-end",
marginTop:-4,
marginBottom:15
},

forgotText:{
color:"#0F766E",
fontWeight:"700"
},

biometricBtn:{
borderWidth:1,
borderColor:"#99F6E4",
backgroundColor:"#ECFEFF",
borderRadius:22,
paddingVertical:12,
paddingHorizontal:14,
flexDirection:"row",
alignItems:"center",
gap:10,
marginBottom:14
},

biometricTextWrap:{flex:1},
biometricText:{fontWeight:"800",color:"#0F766E"},
biometricSubText:{fontSize:12,color:"#475569",marginTop:2},

loginBtn:{
backgroundColor:"#0F766E",
padding:14,
borderRadius:30,
alignItems:"center",
marginBottom:20
},

loginText:{fontWeight:"700"},

dividerRow:{
flexDirection:"row",
alignItems:"center",
marginBottom:20
},

line:{flex:1,height:1,backgroundColor:"#ddd"},
or:{marginHorizontal:10,color:"#777"},

createBtn:{
borderWidth:1,
borderColor:"#0F766E",
borderRadius:25,
padding:14,
alignItems:"center"
},

createText:{color:"#0F766E",fontWeight:"700"},

googleBtn:{
marginTop:12,
borderWidth:1,
borderColor:"#E2E8F0",
borderRadius:25,
padding:14,
alignItems:"center",
backgroundColor:"#F8FAFC"
},

googleText:{fontWeight:"700"},

error:{color:"red"}

});
