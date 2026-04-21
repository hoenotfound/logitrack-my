// apps/mobile-driver/src/screens/JobListScreen.tsx
import React, { useState } from "react";
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, RefreshControl, ActivityIndicator,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "../hooks/useAuthStore";
import { fetchMyJobs } from "../services/api";

type JobTab = "ACTIVE" | "PENDING" | "DONE";

const STATUS_COLOUR: Record<string, string> = {
  PENDING:          "#f59e0b",
  CONFIRMED:        "#3b82f6",
  PICKED_UP:        "#8b5cf6",
  IN_TRANSIT:       "#06b6d4",
  OUT_FOR_DELIVERY: "#10b981",
  DELIVERED:        "#22c55e",
  FAILED_ATTEMPT:   "#ef4444",
};

export default function JobListScreen() {
  const [tab, setTab] = useState<JobTab>("ACTIVE");
  const { token } = useAuthStore();
  const nav = useNavigation<any>();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["my-jobs", tab],
    queryFn: () => fetchMyJobs(token!, tab),
    refetchInterval: 30_000,
  });

  const TABS: { key: JobTab; label: string }[] = [
    { key: "ACTIVE",  label: "Active" },
    { key: "PENDING", label: "Pending" },
    { key: "DONE",    label: "Done" },
  ];

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>My Jobs</Text>
        <Text style={styles.subtitle}>
          {new Date().toLocaleDateString("en-MY", { weekday: "short", day: "numeric", month: "short" })}
        </Text>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        {TABS.map((t) => (
          <TouchableOpacity
            key={t.key}
            style={[styles.tab, tab === t.key && styles.tabActive]}
            onPress={() => setTab(t.key)}
          >
            <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Job list */}
      {isLoading ? (
        <ActivityIndicator color="#3b82f6" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={data?.orders ?? []}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={false} onRefresh={refetch} tintColor="#3b82f6" />}
          contentContainerStyle={{ padding: 16, gap: 12 }}
          ListEmptyComponent={
            <Text style={styles.empty}>No {tab.toLowerCase()} jobs right now.</Text>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              onPress={() => nav.navigate("JobDetail", { orderId: item.id })}
              activeOpacity={0.8}
            >
              {/* Order number + status */}
              <View style={styles.cardRow}>
                <Text style={styles.orderNo}>{item.orderNo}</Text>
                <View style={[styles.badge, { backgroundColor: STATUS_COLOUR[item.status] + "22" }]}>
                  <Text style={[styles.badgeText, { color: STATUS_COLOUR[item.status] }]}>
                    {item.status.replace(/_/g, " ")}
                  </Text>
                </View>
              </View>

              {/* Customer name */}
              <Text style={styles.customerName}>{item.customer?.name}</Text>

              {/* Addresses */}
              <View style={styles.route}>
                <View style={styles.routeRow}>
                  <View style={[styles.dot, { backgroundColor: "#f59e0b" }]} />
                  <Text style={styles.routeText} numberOfLines={1}>
                    {item.pickupAddress?.line1}, {item.pickupAddress?.city}
                  </Text>
                </View>
                <View style={styles.routeLine} />
                <View style={styles.routeRow}>
                  <View style={[styles.dot, { backgroundColor: "#22c55e" }]} />
                  <Text style={styles.routeText} numberOfLines={1}>
                    {item.deliveryAddress?.line1}, {item.deliveryAddress?.city}
                  </Text>
                </View>
              </View>

              {/* Footer: weight + type + priority */}
              <View style={styles.cardFooter}>
                <Text style={styles.meta}>
                  {item.items?.reduce((a: number, i: any) => a + i.unitWeight * i.qty, 0).toFixed(1)} kg
                </Text>
                <Text style={styles.meta}>{item.type.replace(/_/g, " ")}</Text>
                {item.priority === "EXPRESS" && (
                  <View style={styles.expressBadge}>
                    <Text style={styles.expressText}>EXPRESS</Text>
                  </View>
                )}
                {item.codAmount && (
                  <View style={styles.codBadge}>
                    <Text style={styles.codText}>COD RM {Number(item.codAmount).toFixed(2)}</Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f172a" },
  header: { padding: 20, paddingTop: 56 },
  title: { fontSize: 26, fontWeight: "700", color: "#f1f5f9" },
  subtitle: { fontSize: 13, color: "#64748b", marginTop: 2 },
  tabs: { flexDirection: "row", paddingHorizontal: 16, gap: 8, marginBottom: 4 },
  tab: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: "#1e293b" },
  tabActive: { backgroundColor: "#3b82f6" },
  tabText: { fontSize: 13, color: "#64748b", fontWeight: "500" },
  tabTextActive: { color: "#fff" },
  card: { backgroundColor: "#1e293b", borderRadius: 16, padding: 16, borderWidth: 1, borderColor: "#334155" },
  cardRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  orderNo: { fontFamily: "monospace", fontSize: 14, color: "#3b82f6", fontWeight: "600" },
  badge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 11, fontWeight: "600" },
  customerName: { fontSize: 15, fontWeight: "600", color: "#e2e8f0", marginBottom: 12 },
  route: { gap: 4, marginBottom: 12 },
  routeRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  routeText: { flex: 1, fontSize: 13, color: "#94a3b8" },
  routeLine: { width: 1, height: 12, backgroundColor: "#334155", marginLeft: 3.5 },
  cardFooter: { flexDirection: "row", gap: 8, alignItems: "center", flexWrap: "wrap" },
  meta: { fontSize: 12, color: "#64748b" },
  expressBadge: { backgroundColor: "#f59e0b22", borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  expressText: { fontSize: 10, fontWeight: "700", color: "#f59e0b", letterSpacing: 0.5 },
  codBadge: { backgroundColor: "#10b98122", borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  codText: { fontSize: 10, fontWeight: "600", color: "#10b981" },
  empty: { textAlign: "center", color: "#475569", marginTop: 60, fontSize: 15 },
});
