// services/billing/src/billing.service.ts
/**
 * Billing service — Malaysia SST (8%) compliant invoicing
 * Supports FPX, DuitNow, and credit card via Billplz / Stripe
 */
import { PrismaClient, InvoiceStatus } from "@prisma/client";
import Decimal from "decimal.js";

const prisma = new PrismaClient();

// Malaysia SST rate (Service Tax)
const SST_RATE = new Decimal("0.08");

export interface RateCard {
  baseRate: number;       // MYR per kg
  fuelSurcharge: number;  // percentage
  remoteAreaFee: number;  // MYR flat
  codFee: number;         // percentage of COD amount
}

// Simplified rate card — extend per tenant / zone matrix
const DEFAULT_RATE_CARD: RateCard = {
  baseRate: 5.50,
  fuelSurcharge: 0.10,
  remoteAreaFee: 15.00,
  codFee: 0.025,
};

const REMOTE_POSTCODES = new Set(["98000","98100","98400","97000","88999"]); // sample

export function calculateFreight(params: {
  weightKg: number;
  lengthCm?: number;
  widthCm?: number;
  heightCm?: number;
  destPostcode: string;
  codAmount?: number;
  insurance?: boolean;
  declaredValue?: number;
  rateCard?: RateCard;
}): { breakdown: Record<string, Decimal>; subtotal: Decimal; sst: Decimal; total: Decimal } {
  const rc = params.rateCard ?? DEFAULT_RATE_CARD;

  // Volumetric weight (DIM factor 5000)
  let chargeableWeight = new Decimal(params.weightKg);
  if (params.lengthCm && params.widthCm && params.heightCm) {
    const volumetric = new Decimal(params.lengthCm)
      .mul(params.widthCm)
      .mul(params.heightCm)
      .div(5000);
    chargeableWeight = Decimal.max(chargeableWeight, volumetric);
  }

  const baseCharge = chargeableWeight.mul(rc.baseRate);
  const fuelSurcharge = baseCharge.mul(rc.fuelSurcharge);
  const remoteArea = REMOTE_POSTCODES.has(params.destPostcode)
    ? new Decimal(rc.remoteAreaFee)
    : new Decimal(0);
  const codFee = params.codAmount
    ? new Decimal(params.codAmount).mul(rc.codFee)
    : new Decimal(0);
  const insuranceFee =
    params.insurance && params.declaredValue
      ? new Decimal(params.declaredValue).mul("0.005")  // 0.5% of declared value
      : new Decimal(0);

  const breakdown = { baseCharge, fuelSurcharge, remoteArea, codFee, insuranceFee };
  const subtotal = Object.values(breakdown).reduce((acc, v) => acc.add(v), new Decimal(0));
  const sst = subtotal.mul(SST_RATE).toDecimalPlaces(2);
  const total = subtotal.add(sst).toDecimalPlaces(2);

  return { breakdown, subtotal, sst, total };
}

export async function generateInvoice(orderId: string): Promise<string> {
  const order = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    include: {
      items: true,
      deliveryAddress: true,
      customer: true,
      tenant: true,
    },
  });

  const totalWeight = order.items.reduce((acc, i) => acc + i.unitWeight * i.qty, 0);
  const firstItem = order.items[0];

  const freight = calculateFreight({
    weightKg: totalWeight,
    lengthCm: firstItem.length ?? undefined,
    widthCm: firstItem.width ?? undefined,
    heightCm: firstItem.height ?? undefined,
    destPostcode: order.deliveryAddress.postcode,
    codAmount: order.codAmount ? Number(order.codAmount) : undefined,
    insurance: order.insurance,
    declaredValue: order.declaredValue ? Number(order.declaredValue) : undefined,
  });

  const seq = await getNextInvoiceSeq(order.tenantId);
  const invoiceNo = `INV-${new Date().getFullYear()}-${String(seq).padStart(5, "0")}`;

  const invoice = await prisma.invoice.create({
    data: {
      invoiceNo,
      tenantId: order.tenantId,
      orderId: order.id,
      subtotal: freight.subtotal.toNumber(),
      sstAmount: freight.sst.toNumber(),
      total: freight.total.toNumber(),
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // Net 30
      lineItems: {
        create: [
          { description: `Freight charge — ${order.orderNo}`, qty: 1, unitPrice: freight.breakdown.baseCharge.toNumber(), total: freight.breakdown.baseCharge.toNumber() },
          { description: "Fuel surcharge", qty: 1, unitPrice: freight.breakdown.fuelSurcharge.toNumber(), total: freight.breakdown.fuelSurcharge.toNumber() },
          ...(freight.breakdown.codFee.gt(0) ? [{ description: "COD fee", qty: 1, unitPrice: freight.breakdown.codFee.toNumber(), total: freight.breakdown.codFee.toNumber() }] : []),
          ...(freight.breakdown.insuranceFee.gt(0) ? [{ description: "Insurance premium", qty: 1, unitPrice: freight.breakdown.insuranceFee.toNumber(), total: freight.breakdown.insuranceFee.toNumber() }] : []),
        ],
      },
    },
  });

  return invoice.id;
}

export async function recordPayment(invoiceId: string, ref: string, amount: number) {
  const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
  const paid = new Decimal(amount);
  const total = new Decimal(invoice.total.toString());

  const status: InvoiceStatus = paid.gte(total) ? "PAID" : "PARTIAL";

  return prisma.invoice.update({
    where: { id: invoiceId },
    data: { status, paymentRef: ref, paidAt: paid.gte(total) ? new Date() : undefined },
  });
}

async function getNextInvoiceSeq(tenantId: string): Promise<number> {
  const last = await prisma.invoice.findFirst({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
  });
  if (!last) return 1;
  const match = last.invoiceNo.match(/(\d+)$/);
  return match ? Number(match[1]) + 1 : 1;
}
