import { useState, useEffect } from "react";

interface Stats {
  ordersToday: number;
  inTransit: number;
  deliveredToday: number;
  revenueToday: number;
  failedAttempts: number;
  activeDrivers: number;
}

export function useStats() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch("/api/stats")
      .then((res) => res.json())
      .then((data) => {
        setStats(data);
        setIsLoading(false);
      })
      .catch(() => {
        // Return mock data if API not ready
        setStats({
          ordersToday: 24,
          inTransit: 8,
          deliveredToday: 12,
          revenueToday: 4850,
          failedAttempts: 1,
          activeDrivers: 6,
        });
        setIsLoading(false);
      });
  }, []);

  return { stats, isLoading };
}
