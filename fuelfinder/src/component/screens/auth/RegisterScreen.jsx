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
View
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "../../context/AuthContext";
import { useLanguage } from "../../context/LanguageContext";

import { API_BASE_URL } from "../../services/api";

export default function RegisterScreen({ navigation }) {

const { signUp } = useAuth();
const { language, changeLanguage, supportedLanguages, t } = useLanguage();

const [name,setName]=useState("");
const [phone,setPhone]=useState("");
const [vehicleRegistrationType,setVehicleRegistrationType]=useState("");
const [plateNumber,setPlateNumber]=useState("");
const [password,setPassword]=useState("");

const [secure,setSecure]=useState(true);

const [error,setError]=useState("");
const [loading,setLoading]=useState(false);

const [languageMenuOpen,setLanguageMenuOpen]=useState(false);
const [languageQuery,setLanguageQuery]=useState("");

const updatePlateNumber = (value)=>{
setPlateNumber(String(value || "").replace(/\D/g, "").slice(0,5));
};

const vehicleTypeOptions = useMemo(()=>[
{ value:"taxi", label:t("auth.register.vehicleTypes.taxi") },
{ value:"taxi_automobile", label:t("auth.register.vehicleTypes.taxiAutomobile") },
{ value:"private", label:t("auth.register.vehicleTypes.private") },
{ value:"government", label:t("auth.register.vehicleTypes.government") }
], [t]);

/* REGISTER */

const onRegister = async()=>{

setError("");

if(!name || !phone || !vehicleRegistrationType || plateNumber.length !== 5 || !password){

 setError(t("auth.register.requiredError"));
return;

}

setLoading(true);

  try{
 
  const result =
  await signUp({
  name:name.trim(),
  phone:phone.trim(),
  vehicleRegistrationType,
  plateNumber:plateNumber.trim(),
  password
  });

  if(result?.verificationRequired){

  if(!result?.verificationToken){
  setError(t("somethingWentWrong"));
  return;
  }

  navigation.navigate("VerifyPhone",{
  verificationToken:result.verificationToken,
  phone:result?.user?.phone || phone.trim(),
  plateNumber:result?.user?.plateNumber || plateNumber.trim()
  });

  }
 
  }catch(err){

const backendMessage = err?.response?.data?.message;

if(backendMessage){
setError(backendMessage);
}else{
 setError(`${t("auth.register.cannotConnect")} (${API_BASE_URL})`);
}

}finally{
setLoading(false);
}

};

/* LANGUAGE */

const selectedLanguage = useMemo(()=>{
return supportedLanguages.find(l=>l.code===language)
|| supportedLanguages[0];
},[language]);

const filteredLanguages = useMemo(()=>{

if(!languageQuery) return supportedLanguages;

const q = languageQuery.toLowerCase();

return supportedLanguages.filter(l=>
l.nativeName.toLowerCase().includes(q) ||
l.englishName.toLowerCase().includes(q)
);

},[languageQuery]);

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
 {t("auth.register.title")}
 </Text>
 
 <Text style={styles.welcome}>
 {t("auth.register.subtitle")}
 </Text>

</View>

{/* LANGUAGE BUTTON */}

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

<Modal visible={languageMenuOpen} transparent animationType="fade">

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

{/* REGISTER CARD */}

<View style={styles.card}>

 <Text style={styles.cardTitle}>
 {t("auth.register.title")}
 </Text>
 
 <Text style={styles.cardSubtitle}>
 {t("auth.register.subtitle")}
 </Text>
 
 <Text style={styles.label}>
 {t("auth.register.fullName")}
 </Text>

 <TextInput
 placeholder={t("auth.register.fullName")}
 value={name}
 onChangeText={setName}
 style={styles.input}
 />
 
 <Text style={styles.label}>
 {t("auth.register.phoneOptional")}
 </Text>

 <TextInput
 placeholder={t("auth.register.phoneOptional")}
 value={phone}
 onChangeText={setPhone}
 keyboardType="phone-pad"
 textContentType="telephoneNumber"
 autoComplete="tel"
 autoCapitalize="none"
 autoCorrect={false}
 style={styles.input}
 />

 <Text style={styles.label}>
 {t("auth.register.vehicleRegistrationType")}
 </Text>

 <View style={styles.vehicleTypeGrid}>
 {vehicleTypeOptions.map(option=>(
 <Pressable
 key={option.value}
 style={[
 styles.vehicleTypeBtn,
 vehicleRegistrationType===option.value && styles.vehicleTypeBtnActive
 ]}
 onPress={()=>setVehicleRegistrationType(option.value)}
 >
 <Text
 style={[
 styles.vehicleTypeText,
 vehicleRegistrationType===option.value && styles.vehicleTypeTextActive
 ]}
 >
 {option.label}
 </Text>
 </Pressable>
 ))}
 </View>

 <Text style={styles.label}>
 {t("auth.register.plateNumber")}
 </Text>

 <TextInput
 placeholder={t("auth.register.plateNumber")}
 value={plateNumber}
 onChangeText={updatePlateNumber}
 style={styles.input}
 keyboardType="number-pad"
 maxLength={5}
 />
 
 <Text style={styles.label}>
 {t("auth.register.password")}
 </Text>

<View style={styles.passwordRow}>

<TextInput
placeholder="********"
secureTextEntry={secure}
value={password}
onChangeText={setPassword}
style={styles.passwordInput}
/>

<Pressable onPress={()=>setSecure(!secure)}
    
    >
<Ionicons
name={secure?"eye-off-outline":"eye-outline"}
size={22}
/>
</Pressable>

</View>

{error ? <Text style={styles.error}>{error}</Text> : null}

<Pressable
style={styles.loginBtn}
onPress={onRegister}
>

{loading
? <ActivityIndicator color="#000"/>
 : <Text style={styles.loginText}>
 {t("auth.register.button")}
 </Text>
 }

</Pressable>

{/* LOGIN BUTTON */}

<Pressable
style={styles.createBtn}
onPress={()=>navigation.navigate("Login")}
>
 <Text style={styles.createText}>
 {`${t("auth.register.alreadyHave")} ${t("auth.register.login")}`}
 </Text>
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
input:{borderBottomWidth:1,borderBottomColor:"#ddd",marginBottom:15},

vehicleTypeGrid:{
flexDirection:"row",
flexWrap:"wrap",
gap:8,
marginTop:8,
marginBottom:15
},

vehicleTypeBtn:{
borderWidth:1,
borderColor:"#CBD5E1",
borderRadius:18,
paddingVertical:9,
paddingHorizontal:12,
backgroundColor:"#F8FAFC"
},

vehicleTypeBtnActive:{
borderColor:"#0F766E",
backgroundColor:"#CCFBF1"
},

vehicleTypeText:{fontSize:12,fontWeight:"800",color:"#334155"},
vehicleTypeTextActive:{color:"#0F766E"},

passwordRow:{
flexDirection:"row",
alignItems:"center",
borderBottomWidth:1,
borderBottomColor:"#ddd",
marginBottom:15
},

passwordInput:{flex:1},

loginBtn:{
backgroundColor:"#0F766E",
color:"#fff",
padding:14,
borderRadius:30,
alignItems:"center",
marginBottom:20
},

loginText:{fontWeight:"700"},

createBtn:{
borderWidth:1,
borderColor:"#0F766E",
borderRadius:25,
padding:14,
alignItems:"center",
marginBottom:15
},

createText:{color:"#0F766E",fontWeight:"700"},

error:{color:"red"}

});
