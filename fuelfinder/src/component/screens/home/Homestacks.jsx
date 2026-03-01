// src/navigation/HomeStack.js
import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import BottomTabs from "../../navigation/BottomTabs";
// import StationDetails from "./StationDetails";


const Stack = createNativeStackNavigator();

export default function HomeStack() {
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="MainTabs" component={BottomTabs} />
        {/* <Stack.Screen name="StationDetails" component={StationDetails} /> */}
      </Stack.Navigator>
    </NavigationContainer>
  );
}