// Simplified tracking stream — no Redis, in-memory only
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  req: NextRequest,
  { params }: { params: { orderNo: string } }
) {
  // For MVP demo, return a simple response
  // Real-time SSE works once the tracking service is running
  return NextResponse.json({
    orderNo: params.orderNo,
    message: "Live tracking available when tracking service is running",
    liveLocation: null,
  });
}
