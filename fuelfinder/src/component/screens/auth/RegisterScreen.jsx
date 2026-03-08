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
  ScrollView
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../context/AuthContext";
import { useLanguage } from "../../context/LanguageContext";
import { API_BASE_URL } from "../../services/api";

export default function RegisterScreen({ navigation }) {

  const { signUp } = useAuth();
  const { t } = useLanguage();

  const [name,setName] = useState("");
  const [email,setEmail] = useState("");
  const [phone,setPhone] = useState("");
  const [password,setPassword] = useState("");
  const [error,setError] = useState("");
  const [loading,setLoading] = useState(false);

  const onRegister = async () => {

    setError("");

    if(!name.trim() || !email.trim() || !password){
      setError(t("auth.register.requiredError"));
      return;
    }

    setLoading(true);

    try{

      await signUp({
        name:name.trim(),
        email:email.trim(),
        phone:phone.trim(),
        password
      });

    }catch(err){

      const backendMessage = err?.response?.data?.message;

      if(backendMessage){
        setError(backendMessage);
      }else{
        setError(`${t("auth.register.cannotConnect")} (${API_BASE_URL}).`);
      }

    }finally{
      setLoading(false);
    }
  };

  return (

<SafeAreaView style={styles.safeArea}>

<KeyboardAvoidingView
style={{flex:1}}
behavior={Platform.OS === "ios" ? "padding" : undefined}
>

<ScrollView showsVerticalScrollIndicator={false}>

{/* HEADER */}

<View style={styles.header}>

<Pressable
style={styles.backBtn}
onPress={()=>navigation.goBack()}
>
<Ionicons name="arrow-back" size={20} color="#000"/>
</Pressable>

<Pressable style={styles.profileBtn}>
<Ionicons name="person-outline" size={22} color="#000"/>
</Pressable>

<Text style={styles.hello}>Join Us</Text>
<Text style={styles.welcome}>Create Free Account</Text>

</View>


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


{/* REGISTER BUTTON */}

<Pressable
style={styles.loginBtn}
onPress={onRegister}
disabled={loading}
>

{loading
? <ActivityIndicator color="#000"/>
: <Text style={styles.loginText}>Create Account</Text>
}

</Pressable>


{/* DIVIDER */}

<View style={styles.dividerRow}>

<View style={styles.line}/>
<Text style={styles.or}>or</Text>
<View style={styles.line}/>

</View>


{/* LOGIN LINK */}

<Pressable
style={styles.createBtn}
onPress={()=>navigation.navigate("Login")}
>

<Text style={styles.createText}>
Already have account? Login
</Text>

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
minHeight:650
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

loginBtn:{
backgroundColor:"#FFC107",
padding:14,
borderRadius:30,
alignItems:"center",
marginTop:10,
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
}

});






 