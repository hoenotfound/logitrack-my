// services/payments/src/billplz.service.ts
/**
 * Billplz payment gateway — Malaysia FPX, DuitNow QR
 * Docs: https://www.billplz.com/api
 */
import crypto from "crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const BILLPLZ_API = "https://www.billplz.com/api/v3";
const COLLECTION_ID = process.env.BILLPLZ_COLLECTION_ID!;
const API_KEY = process.env.BILLPLZ_API_KEY!;

interface BillplzBill {
  id: string;
  collection_id: string;
  paid: boolean;
  state: string;
  amount: number;       // in sen (MYR × 100)
  paid_amount: number;
  due_at: string;
  email: string;
  mobile: string;
  name: string;
  url: string;         // payment URL to redirect customer
  reference_1_label: string;
  reference_1: string;
  paid_at?: string;
}

/**
 * Create a Billplz bill for an invoice.
 * Returns the payment URL to redirect the customer.
 */
export async function createBillplzBill(invoiceId: string): Promise<string> {
  const invoice = await prisma.invoice.findUniqueOrThrow({
    where: { id: invoiceId },
    include: { order: { include: { customer: true } } },
  });

  const customer = invoice.order?.customer;
  if (!customer) throw new Error("No customer linked to invoice");

  const amountSen = Math.round(Number(invoice.total) * 100);

  const body = new URLSearchParams({
    collection_id: COLLECTION_ID,
    email: customer.email,
    mobile: customer.phone,
    name: customer.name,
    amount: String(amountSen),
    callback_url: `${process.env.NEXTAUTH_URL}/api/payments/billplz/callback`,
    redirect_url: `${process.env.NEXTAUTH_URL}/invoices/${invoiceId}/receipt`,
    description: `LogiTrack Invoice ${invoice.invoiceNo}`,
    reference_1_label: "Invoice No",
    reference_1: invoice.invoiceNo,
    reference_2_label: "Order No",
    reference_2: invoice.order?.id ?? "",
    due_at: invoice.dueDate.toISOString().split("T")[0],
  });

  const res = await fetch(`${BILLPLZ_API}/bills`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(API_KEY + ":").toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Billplz error: ${err}`);
  }

  const bill: BillplzBill = await res.json();

  // Store Billplz bill ID in invoice
  await prisma.invoice.update({
    where: { id: invoiceId },
    data: { paymentRef: bill.id },
  });

  return bill.url;
}

/**
 * Verify Billplz webhook signature (X-Signature header)
 * Called from: POST /api/payments/billplz/callback
 */
export function verifyBillplzSignature(
  params: Record<string, string>,
  xSignature: string
): boolean {
  // Billplz signs: alphabetically sorted key=value pairs joined by "|"
  const sorted = Object.keys(params)
    .filter((k) => k !== "x_signature")
    .sort()
    .map((k) => `${k}${params[k]}`)
    .join("|");

  const expected = crypto
    .createHmac("sha256", API_KEY)
    .update(sorted)
    .digest("hex");

  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(xSignature));
}

/**
 * Handle Billplz callback (redirect + webhook)
 */
export async function handleBillplzCallback(params: Record<string, string>) {
  const {
    id: billId,
    paid,
    paid_amount,
    x_signature,
  } = params;

  if (!verifyBillplzSignature(params, x_signature)) {
    throw new Error("Invalid Billplz signature");
  }

  if (paid !== "true") {
    // Payment not completed — could be cancelled
    return { paid: false };
  }

  const invoice = await prisma.invoice.findFirst({
    where: { paymentRef: billId },
  });
  if (!invoice) throw new Error(`No invoice found for Billplz bill ${billId}`);

  const paidMYR = Number(paid_amount) / 100;

  await prisma.invoice.update({
    where: { id: invoice.id },
    data: {
      status: paidMYR >= Number(invoice.total) ? "PAID" : "PARTIAL",
      paidAt: new Date(),
    },
  });

  return { paid: true, invoiceId: invoice.id, amount: paidMYR };
}
