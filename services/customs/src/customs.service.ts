// services/customs/src/customs.service.ts
/**
 * Cross-border customs service
 * Malaysia customs form types: K1 (import), K2 (export), K8 (personal), K9 (warehouse)
 * Integrates with Royal Malaysian Customs Dept (JKDM) uCustoms API
 */
import { PrismaClient, CustomsStatus } from "@prisma/client";

const prisma = new PrismaClient();

// Malaysia duty-free threshold: RM500 (JKDM guideline)
const DUTY_FREE_THRESHOLD_MYR = 500;

// Simplified HS code duty rate lookup (extend with full tariff schedule)
const HS_DUTY_RATES: Record<string, number> = {
  "8471": 0,       // computers
  "8517": 0,       // phones
  "6109": 0.20,    // t-shirts (20%)
  "6203": 0.20,    // men's garments
  "8703": 0.10,    // cars (10% import duty, simplified)
  "2204": 0,       // wine (excise applies separately)
  "9503": 0,       // toys
};

export interface CreateCustomsInput {
  tenantId: string;
  shipmentId: string;
  declarationType: "K1" | "K2" | "K8" | "K9";
  exportCountry: string;   // ISO alpha-2
  importCountry: string;
  currency: string;
  incoterms: "FOB" | "CIF" | "EXW" | "DDP";
  items: {
    description: string;
    hsCode: string;
    qty: number;
    unitValue: number;     // in specified currency
  }[];
}

export async function createCustomsDeclaration(input: CreateCustomsInput) {
  const totalValue = input.items.reduce((acc, i) => acc + i.qty * i.unitValue, 0);

  // Calculate estimated duty
  let estimatedDuty = 0;
  if (totalValue > DUTY_FREE_THRESHOLD_MYR || input.importCountry !== "MY") {
    for (const item of input.items) {
      const chapter = item.hsCode.substring(0, 4);
      const rate = HS_DUTY_RATES[chapter] ?? 0.05; // default 5%
      estimatedDuty += item.qty * item.unitValue * rate;
    }
  }

  const decl = await prisma.customsDeclaration.create({
    data: {
      tenantId: input.tenantId,
      shipmentId: input.shipmentId,
      declarationType: input.declarationType,
      exportCountry: input.exportCountry,
      importCountry: input.importCountry,
      totalValue,
      currency: input.currency,
      incoterms: input.incoterms,
      dutyAmount: estimatedDuty,
      status: "DRAFT",
    },
  });

  return decl;
}

export async function submitToJKDM(declarationId: string) {
  const decl = await prisma.customsDeclaration.findUniqueOrThrow({
    where: { id: declarationId },
    include: { shipment: { include: { order: { include: { items: true } } } } },
  });

  // Build uCustoms payload
  const payload = buildJKDMPayload(decl);

  try {
    // Real integration would call: https://www.customs.gov.my/en/PA/Pages/uCustoms.aspx
    const res = await fetch(process.env.JKDM_API_URL!, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.JKDM_API_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) throw new Error(`JKDM API error: ${res.status}`);
    const data = await res.json();

    await prisma.customsDeclaration.update({
      where: { id: declarationId },
      data: { status: "SUBMITTED", submittedAt: new Date(), customsRef: data.referenceNo },
    });

    return { success: true, customsRef: data.referenceNo };
  } catch (err) {
    console.error("JKDM submission failed:", err);
    throw err;
  }
}

export async function checkCustomsStatus(declarationId: string) {
  const decl = await prisma.customsDeclaration.findUniqueOrThrow({
    where: { id: declarationId },
  });
  if (!decl.customsRef) throw new Error("Not yet submitted to customs");

  const res = await fetch(`${process.env.JKDM_API_URL}/status/${decl.customsRef}`, {
    headers: { "Authorization": `Bearer ${process.env.JKDM_API_KEY}` },
  });
  const data = await res.json();

  const statusMap: Record<string, CustomsStatus> = {
    "A": "APPROVED",
    "R": "REJECTED",
    "Q": "QUERIED",
    "S": "SUBMITTED",
  };

  const newStatus = statusMap[data.status] ?? decl.status;
  await prisma.customsDeclaration.update({
    where: { id: declarationId },
    data: {
      status: newStatus,
      approvedAt: newStatus === "APPROVED" ? new Date() : undefined,
    },
  });

  return { status: newStatus, remarks: data.remarks };
}

function buildJKDMPayload(decl: any) {
  return {
    formType: decl.declarationType,
    referenceNo: decl.shipment.awbNo,
    exportCountry: decl.exportCountry,
    importCountry: decl.importCountry,
    incoterms: decl.incoterms,
    currency: decl.currency,
    totalValue: Number(decl.totalValue),
    items: decl.shipment.order.items.map((i: any) => ({
      description: i.description,
      hsCode: i.hsCode,
      quantity: i.qty,
      unitValue: Number(i.unitValue),
    })),
  };
}
