// MyInvois e-Invoice API — stub for MVP
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const body = await req.json();
  return NextResponse.json({
    message: "e-Invoice submission stub — configure LHDN credentials to enable",
    invoiceId: body.invoiceId,
    status: "DRAFT",
  });
}
