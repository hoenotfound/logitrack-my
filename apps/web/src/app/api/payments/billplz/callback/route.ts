// Billplz FPX payment callback — stub for MVP
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  return NextResponse.json({ received: true });
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const billId = searchParams.get("billplz[id]");
  const paid = searchParams.get("billplz[paid]");
  return NextResponse.redirect(
    new URL(`/?payment=${paid === "true" ? "success" : "failed"}&bill=${billId}`, req.url)
  );
}
