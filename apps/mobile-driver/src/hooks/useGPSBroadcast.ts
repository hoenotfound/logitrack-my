// apps/mobile-driver/src/hooks/useGPSBroadcast.ts
/**
 * Foreground GPS broadcast hook
 * Sends GPS pings to the tracking API while the driver has an active job.
 * Background tracking is handled by the Expo TaskManager task in App.tsx.
 */
import { useEffect, useRef } from "react";
import * as Location from "expo-location";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "./useAuthStore";
import { fetchMyJobs } from "../services/api";

const PING_INTERVAL_MS = 10_000; // 10 seconds
const API_URL = process.env.EXPO_PUBLIC_API_URL;

export function useGPSBroadcast() {
  const { token } = useAuthStore();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Find the active in-progress job
  const { data } = useQuery({
    queryKey: ["my-jobs", "ACTIVE"],
    queryFn: () => fetchMyJobs(token!, "ACTIVE"),
    refetchInterval: 30_000,
  });

  const activeJob = data?.orders?.find((o: any) =>
    ["IN_TRANSIT", "OUT_FOR_DELIVERY", "PICKED_UP"].includes(o.status)
  );

  useEffect(() => {
    if (!activeJob || !token) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }

    const sendPing = async () => {
      try {
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });

        await fetch(`${API_URL}/api/tracking/ping`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            orderId: activeJob.id,
            lat: loc.coords.latitude,
            lng: loc.coords.longitude,
            speed: loc.coords.speed,
            heading: loc.coords.heading,
            accuracy: loc.coords.accuracy,
            ts: loc.timestamp,
          }),
        });
      } catch {
        // Silent — network may be briefly unavailable
      }
    };

    sendPing(); // immediate first ping
    intervalRef.current = setInterval(sendPing, PING_INTERVAL_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [activeJob?.id, token]);
}
