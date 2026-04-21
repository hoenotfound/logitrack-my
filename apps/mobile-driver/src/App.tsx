// apps/mobile-driver/src/App.tsx
import React, { useEffect } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StatusBar } from "expo-status-bar";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { useAuthStore } from "./hooks/useAuthStore";
import { useGPSBroadcast } from "./hooks/useGPSBroadcast";

// Screens
import LoginScreen from "./screens/LoginScreen";
import JobListScreen from "./screens/JobListScreen";
import JobDetailScreen from "./screens/JobDetailScreen";
import NavigateScreen from "./screens/NavigateScreen";
import PODScreen from "./screens/PODScreen";
import ProfileScreen from "./screens/ProfileScreen";
import EarningsScreen from "./screens/EarningsScreen";

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();
const queryClient = new QueryClient();

// Background GPS task — runs even when app is minimised
const GPS_TASK = "LOGITRACK_GPS_TASK";

TaskManager.defineTask(GPS_TASK, async ({ data, error }: any) => {
  if (error) { console.error("GPS task error:", error); return; }
  if (data) {
    const { locations } = data;
    const loc = locations[0];
    // Post to tracking API
    const token = await getStoredToken();
    if (!token) return;
    await fetch(`${process.env.EXPO_PUBLIC_API_URL}/api/tracking/ping`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        lat: loc.coords.latitude,
        lng: loc.coords.longitude,
        speed: loc.coords.speed,
        heading: loc.coords.heading,
        accuracy: loc.coords.accuracy,
        ts: loc.timestamp,
      }),
    }).catch(() => {}); // silent fail — will retry on next ping
  }
});

async function getStoredToken(): Promise<string | null> {
  // AsyncStorage read — injected via task-manager context
  return null;
}

function MainTabs() {
  useGPSBroadcast(); // starts foreground GPS when on a job

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: "#0f172a", borderTopColor: "#1e293b" },
        tabBarActiveTintColor: "#3b82f6",
        tabBarInactiveTintColor: "#64748b",
      }}
    >
      <Tab.Screen name="Jobs" component={JobsStack} options={{ tabBarLabel: "Jobs" }} />
      <Tab.Screen name="Earnings" component={EarningsScreen} options={{ tabBarLabel: "Earnings" }} />
      <Tab.Screen name="Profile" component={ProfileScreen} options={{ tabBarLabel: "Profile" }} />
    </Tab.Navigator>
  );
}

function JobsStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="JobList" component={JobListScreen} />
      <Stack.Screen name="JobDetail" component={JobDetailScreen} />
      <Stack.Screen name="Navigate" component={NavigateScreen} />
      <Stack.Screen name="POD" component={PODScreen} />
    </Stack.Navigator>
  );
}

export default function App() {
  const { isAuthenticated } = useAuthStore();

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestBackgroundPermissionsAsync();
      if (status === "granted") {
        await Location.startLocationUpdatesAsync(GPS_TASK, {
          accuracy: Location.Accuracy.High,
          timeInterval: 10000,    // 10 seconds
          distanceInterval: 50,   // or every 50 metres
          showsBackgroundLocationIndicator: true,
          foregroundService: {
            notificationTitle: "LogiTrack — On delivery",
            notificationBody: "Tracking your location for active jobs.",
            notificationColor: "#3b82f6",
          },
        });
      }
    })();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <NavigationContainer>
        <StatusBar style="light" />
        {isAuthenticated ? <MainTabs /> : <LoginScreen />}
      </NavigationContainer>
    </QueryClientProvider>
  );
}
