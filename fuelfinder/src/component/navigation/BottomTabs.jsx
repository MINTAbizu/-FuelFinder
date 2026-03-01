// src/navigation/BottomTabs.js
import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";

import HomeScreen from "../screens/home/HomeScreen";
// import MapScreen from "../screens/home/MapScreen";
// import MapScreen from "../screens/home/MapScreen";
// import FavoritesScreen from "../screens/favorites/FavoritesScreen";
// import MapScreen from "../screens/home/Mapscreen";
// import ProfileScreen from "../screens/profile/ProfileScreen";

const Tab = createBottomTabNavigator();

export default function BottomTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: "#FF6B00",
        tabBarInactiveTintColor: "#555",
        tabBarStyle: {
          backgroundColor: "#fff",
          height: 65,
          paddingBottom: 5,
          paddingTop: 5,
        },
        tabBarIcon: ({ focused, color, size }) => {
          let iconName;
          if (route.name === "Home") iconName = focused ? "home" : "home-outline";
        //   else if (route.name === "Map") iconName = focused ? "map" : "map-outline";
        //   else if (route.name === "Favorites") iconName = focused ? "star" : "star-outline";
        //   else if (route.name === "Profile") iconName = focused ? "person" : "person-outline";

          return <Ionicons name={iconName} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      {/* <Tab.Screen name="Map" component={MapScreen} /> */}
      {/* <Tab.Screen name="Favorites" component={FavoritesScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} /> */}
    </Tab.Navigator>
  );
}