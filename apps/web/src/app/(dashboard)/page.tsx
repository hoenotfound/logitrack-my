// apps/web/src/app/(dashboard)/page.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { useOrders } from "@/hooks/useOrders";
import { useStats } from "@/hooks/useStats";
import { OrderStatusBadge } from "@/components/OrderStatusBadge";
import { formatMYR } from "@logitrack/utils";

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState<"all" | "pending" | "transit" | "delivered">("all");
  const { orders, isLoading } = useOrders({ status: activeTab === "all" ? undefined : activeTab.toUpperCase() });
  const { stats } = useStats();

  const TABS = [
    { key: "all",       label: "All orders" },
    { key: "pending",   label: "Pending" },
    { key: "transit",   label: "In transit" },
    { key: "delivered", label: "Delivered" },
  ] as const;

  const STAT_CARDS = [
    { label: "Orders today",      value: stats?.ordersToday ?? 0,          delta: "+12%" },
    { label: "In transit",        value: stats?.inTransit ?? 0,            delta: null },
    { label: "Delivered today",   value: stats?.deliveredToday ?? 0,        delta: "+8%" },
    { label: "Revenue (MYR)",     value: formatMYR(stats?.revenueToday ?? 0), delta: "+5%" },
    { label: "Failed attempts",   value: stats?.failedAttempts ?? 0,        delta: stats?.failedAttempts ? "-2%" : null },
    { label: "Active drivers",    value: stats?.activeDrivers ?? 0,         delta: null },
  ];

  return (
    <main className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Operations</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {new Date().toLocaleDateString("en-MY", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
          </p>
        </div>
        <Link
          href="/orders/new"
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition"
        >
          + New order
        </Link>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {STAT_CARDS.map((card) => (
          <div key={card.label} className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 shadow-sm">
            <p className="text-xs text-gray-500 uppercase tracking-wide">{card.label}</p>
            <p className="text-2xl font-semibold mt-1">{card.value}</p>
            {card.delta && (
              <p className={`text-xs mt-1 ${card.delta.startsWith("+") ? "text-green-600" : "text-red-500"}`}>
                {card.delta} vs yesterday
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Order table */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm overflow-hidden">
        {/* Tabs */}
        <div className="flex border-b border-gray-200 dark:border-gray-800 px-4">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition ${
                activeTab === tab.key
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800 text-xs text-gray-500 uppercase">
              <tr>
                <th className="px-4 py-3 text-left">Order no.</th>
                <th className="px-4 py-3 text-left">Customer</th>
                <th className="px-4 py-3 text-left">Type</th>
                <th className="px-4 py-3 text-left">Destination</th>
                <th className="px-4 py-3 text-left">Driver</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Est. delivery</th>
                <th className="px-4 py-3 text-left">Value (MYR)</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {isLoading && (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-gray-400">Loading…</td>
                </tr>
              )}
              {orders?.data?.map((order: any) => (
                <tr key={order.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition">
                  <td className="px-4 py-3 font-mono font-medium text-blue-600">
                    <Link href={`/orders/${order.id}`}>{order.orderNo}</Link>
                  </td>
                  <td className="px-4 py-3">{order.customer?.name}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center rounded-md bg-gray-100 dark:bg-gray-800 px-2 py-0.5 text-xs">
                      {order.type.replace("_", " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                    {order.deliveryAddress?.city}, {order.deliveryAddress?.state}
                  </td>
                  <td className="px-4 py-3">
                    {order.assignedTo?.name ?? <span className="text-gray-400 text-xs">Unassigned</span>}
                  </td>
                  <td className="px-4 py-3">
                    <OrderStatusBadge status={order.status} />
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                    {order.scheduledDelivery
                      ? new Date(order.scheduledDelivery).toLocaleDateString("en-MY")
                      : "—"}
                  </td>
                  <td className="px-4 py-3">
                    {order.declaredValue ? formatMYR(Number(order.declaredValue)) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/orders/${order.id}`} className="text-xs text-blue-600 hover:underline">
                      View →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
