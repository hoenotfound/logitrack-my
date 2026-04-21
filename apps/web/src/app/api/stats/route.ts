import { NextResponse } from "next/server";

export async function GET() {
  // Mock stats for MVP demo — replace with real DB queries later
  const stats = {
    ordersToday: 24,
    inTransit: 8,
    deliveredToday: 12,
    revenueToday: 4850.00,
    failedAttempts: 1,
    activeDrivers: 6,
  };

  return NextResponse.json(stats);
}
