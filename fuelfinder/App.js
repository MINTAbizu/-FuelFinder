import "react-native-gesture-handler";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaProvider } from "react-native-safe-area-context";
import HomeScreen from "./src/component/screens/home/HomeScreen";
import StationDetails from "./src/component/screens/home/StationDetails";
import LoginScreen from "./src/component/screens/auth/LoginScreen";
import RegisterScreen from "./src/component/screens/auth/RegisterScreen";
import { AuthProvider, useAuth } from "./src/component/context/AuthContext";

const queryClient = new QueryClient();
const RootStack = createNativeStackNavigator();
const HomeStack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function LoadingScreen() {
  return (
    <View style={styles.loadingScreen}>
      <ActivityIndicator size="large" color="#0F766E" />
      <Text style={styles.loadingText}>Loading session...</Text>
    </View>
  );
}

function PlaceholderScreen({ title }) {
  return (
    <View style={styles.placeholderScreen}>
      <Text style={styles.placeholderTitle}>{title}</Text>
      <Text style={styles.placeholderSubTitle}>Coming soon</Text>
    </View>
  );
}

function ProfileScreen() {
  const { user, signOut } = useAuth();
  return (
    <View style={styles.profileScreen}>
      <Text style={styles.profileTitle}>Profile</Text>
      <Text style={styles.profileText}>Name: {user?.name || "-"}</Text>
      <Text style={styles.profileText}>Email: {user?.email || "-"}</Text>
      <Text style={styles.profileLogout} onPress={signOut}>
        Logout
      </Text>
    </View>
  );
}

function HomeStackNavigator() {
  return (
    <HomeStack.Navigator>
      <HomeStack.Screen
        name="HomeMain"
        component={HomeScreen}
        options={{ headerShown: false }}
      />
      <HomeStack.Screen
        name="StationDetails"
        component={StationDetails}
        options={{ title: "Station Details" }}
      />
    </HomeStack.Navigator>
  );
}

function AppTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: "#0F766E",
        tabBarInactiveTintColor: "#64748B",
        tabBarStyle: {
          height: 64,
          paddingTop: 6,
          paddingBottom: 8,
          borderTopWidth: 1,
          borderTopColor: "#E2E8F0",
          backgroundColor: "#FFFFFF",
        },
        tabBarLabelStyle: { fontSize: 12, fontWeight: "700" },
        tabBarIcon: ({ focused, color, size }) => {
          const iconByRoute = {
            Home: focused ? "home" : "home-outline",
            Map: focused ? "map" : "map-outline",
            Alerts: focused ? "notifications" : "notifications-outline",
            Profile: focused ? "person" : "person-outline",
          };
          return <Ionicons name={iconByRoute[route.name]} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Home" component={HomeStackNavigator} />
      <Tab.Screen
        name="Map"
        children={() => <PlaceholderScreen title="Map" />}
      />
      <Tab.Screen
        name="Alerts"
        children={() => <PlaceholderScreen title="Alerts" />}
      />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

function AuthStack() {
  return (
    <RootStack.Navigator screenOptions={{ headerShown: false }}>
      <RootStack.Screen name="Login" component={LoginScreen} />
      <RootStack.Screen name="Register" component={RegisterScreen} />
    </RootStack.Navigator>
  );
}

function AppNavigator() {
  const { isLoading, isAuthenticated } = useAuth();

  if (isLoading) {
    return <LoadingScreen />;
  }

  return (
    <NavigationContainer>
      {isAuthenticated ? <AppTabs /> : <AuthStack />}
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <AppNavigator />
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loadingScreen: {
    flex: 1,
    backgroundColor: "#F8FAFC",
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    marginTop: 10,
    color: "#475569",
    fontWeight: "700",
  },
  placeholderScreen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F8FAFC",
  },
  placeholderTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#0F172A",
    marginBottom: 4,
  },
  placeholderSubTitle: {
    fontSize: 14,
    color: "#64748B",
  },
  profileScreen: {
    flex: 1,
    backgroundColor: "#F8FAFC",
    padding: 16,
  },
  profileTitle: {
    fontSize: 24,
    fontWeight: "900",
    color: "#0F172A",
    marginBottom: 10,
  },
  profileText: {
    fontSize: 14,
    color: "#334155",
    marginBottom: 6,
    fontWeight: "600",
  },
  profileLogout: {
    marginTop: 16,
    fontSize: 15,
    color: "#B91C1C",
    fontWeight: "800",
  },
});
