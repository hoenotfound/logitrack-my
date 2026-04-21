// apps/web/src/app/api/orders/route.ts
// Simplified MVP version — no auth required for demo
import { NextRequest, NextResponse } from "next/server";

// Mock orders for demo — replace with real DB queries once DB is connected
const MOCK_ORDERS = [
  {
    id: "1", orderNo: "LT-2025-00001", status: "IN_TRANSIT", type: "LAST_MILE",
    customer: { name: "Amir Trading Sdn Bhd" },
    deliveryAddress: { city: "Petaling Jaya", state: "SELANGOR" },
    assignedTo: { name: "Razif bin Ahmad" },
    scheduledDelivery: new Date(Date.now() + 86400000).toISOString(),
    declaredValue: "250.00",
  },
  {
    id: "2", orderNo: "LT-2025-00002", status: "PENDING", type: "FREIGHT",
    customer: { name: "Maju Logistics Bhd" },
    deliveryAddress: { city: "Johor Bahru", state: "JOHOR" },
    assignedTo: null,
    scheduledDelivery: new Date(Date.now() + 172800000).toISOString(),
    declaredValue: "1200.00",
  },
  {
    id: "3", orderNo: "LT-2025-00003", status: "DELIVERED", type: "LAST_MILE",
    customer: { name: "Syarikat Zainab & Co" },
    deliveryAddress: { city: "Georgetown", state: "PENANG" },
    assignedTo: { name: "Siti Norzahara" },
    scheduledDelivery: new Date(Date.now() - 86400000).toISOString(),
    declaredValue: "89.90",
  },
  {
    id: "4", orderNo: "LT-2025-00004", status: "OUT_FOR_DELIVERY", type: "LAST_MILE",
    customer: { name: "Kedai Runcit Harun" },
    deliveryAddress: { city: "Ipoh", state: "PERAK" },
    assignedTo: { name: "Hafiz Roslan" },
    scheduledDelivery: new Date().toISOString(),
    declaredValue: "45.00",
  },
  {
    id: "5", orderNo: "LT-2025-00005", status: "CONFIRMED", type: "CROSS_BORDER",
    customer: { name: "Global Imports MY" },
    deliveryAddress: { city: "Kuala Lumpur", state: "KUALA_LUMPUR" },
    assignedTo: null,
    scheduledDelivery: new Date(Date.now() + 259200000).toISOString(),
    declaredValue: "5800.00",
  },
];

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");

  let orders = MOCK_ORDERS;
  if (status) {
    orders = orders.filter(o => o.status === status);
  }

  return NextResponse.json({ data: orders, total: orders.length });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  return NextResponse.json({ id: "new-" + Date.now(), orderNo: "LT-2025-99999", ...body }, { status: 201 });
}
