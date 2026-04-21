// services/einvoice/src/myinvois.service.ts
/**
 * LHDN MyInvois e-Invoice Service
 * Malaysia mandate: compulsory from Aug 2024 (large co.) rolling to all taxpayers by 2025
 * API docs: https://sdk.myinvois.hasil.gov.my/
 *
 * Flow:
 * 1. Get access token (client_credentials)
 * 2. Submit invoice as UBL XML or JSON
 * 3. Poll or webhook for validation result
 * 4. Store LHDN UUID + QR code on invoice
 */
import crypto from "crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const MYINVOIS_BASE = process.env.MYINVOIS_API_URL ?? "https://api.myinvois.hasil.gov.my";
const CLIENT_ID = process.env.MYINVOIS_CLIENT_ID!;
const CLIENT_SECRET = process.env.MYINVOIS_CLIENT_SECRET!;
const TAXPAYER_TIN = process.env.MYINVOIS_TAXPAYER_TIN!;
const BUSINESS_REG = process.env.MYINVOIS_BUSINESS_REG!;

// ─────────────────────────────────────────────
// Auth
// ─────────────────────────────────────────────
let tokenCache: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.expiresAt - 30_000) {
    return tokenCache.token;
  }

  const res = await fetch(
    `https://preprod-api.myinvois.hasil.gov.my/connect/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: "client_credentials",
        scope: "InvoicingAPI",
      }).toString(),
    }
  );

  if (!res.ok) throw new Error(`MyInvois auth failed: ${res.status}`);
  const data = await res.json();

  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };

  return tokenCache.token;
}

// ─────────────────────────────────────────────
// Submit e-Invoice
// ─────────────────────────────────────────────
export async function submitEInvoice(invoiceId: string): Promise<{
  uuid: string;
  longId: string;
  status: string;
}> {
  const invoice = await prisma.invoice.findUniqueOrThrow({
    where: { id: invoiceId },
    include: {
      lineItems: true,
      tenant: true,
      order: {
        include: {
          customer: true,
          deliveryAddress: true,
        },
      },
    },
  });

  const token = await getAccessToken();
  const document = buildEInvoiceDocument(invoice);

  // LHDN requires SHA-256 hash and base64 encoding of each document
  const docJson = JSON.stringify(document);
  const docHash = crypto.createHash("sha256").update(docJson).digest("hex");
  const docBase64 = Buffer.from(docJson).toString("base64");

  const payload = {
    documents: [
      {
        format: "JSON",
        document: docBase64,
        documentHash: docHash,
        codeNumber: invoice.invoiceNo,
      },
    ],
  };

  const res = await fetch(`${MYINVOIS_BASE}/api/v1.0/documentsubmissions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`MyInvois submission error: ${err}`);
  }

  const result = await res.json();
  const accepted = result.acceptedDocuments?.[0];

  if (!accepted) {
    const rejected = result.rejectedDocuments?.[0];
    throw new Error(`MyInvois rejected: ${JSON.stringify(rejected?.error)}`);
  }

  // Store LHDN UUID on invoice (add field to schema if needed)
  console.log(`e-Invoice submitted — UUID: ${accepted.uuid}, Long ID: ${accepted.longId}`);

  return {
    uuid: accepted.uuid,
    longId: accepted.longId,
    status: "SUBMITTED",
  };
}

/**
 * Check LHDN validation status
 */
export async function checkEInvoiceStatus(lhdnUuid: string): Promise<{
  status: "Valid" | "Invalid" | "Cancelled" | "Submitted";
  validationSteps?: { name: string; status: string; error?: string }[];
}> {
  const token = await getAccessToken();

  const res = await fetch(
    `${MYINVOIS_BASE}/api/v1.0/documents/${lhdnUuid}/details`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!res.ok) throw new Error(`Status check failed: ${res.status}`);
  const data = await res.json();

  return {
    status: data.status,
    validationSteps: data.validationResults?.validationSteps,
  };
}

// ─────────────────────────────────────────────
// Build UBL 2.1 JSON document (LHDN format)
// ─────────────────────────────────────────────
function buildEInvoiceDocument(invoice: any): object {
  const issueDate = invoice.createdAt.toISOString().split("T")[0];
  const issueTime = invoice.createdAt.toISOString().split("T")[1].replace("Z", "");

  return {
    "_D": "urn:oasis:names:specification:ubl:schema:xsd:Invoice-2",
    "_A": "urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2",
    "_B": "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2",
    "Invoice": [
      {
        "ID": [{ "_": invoice.invoiceNo }],
        "IssueDate": [{ "_": issueDate }],
        "IssueTime": [{ "_": issueTime }],
        "InvoiceTypeCode": [{ "_": "01", "listVersionID": "1.0" }], // 01 = tax invoice
        "DocumentCurrencyCode": [{ "_": "MYR" }],
        "TaxCurrencyCode": [{ "_": "MYR" }],

        // Supplier (logistics company)
        "AccountingSupplierParty": [
          {
            "Party": [
              {
                "IndustryClassificationCode": [{ "_": "49400", "name": "Road freight transport" }],
                "PartyIdentification": [
                  { "ID": [{ "_": TAXPAYER_TIN, "schemeID": "TIN" }] },
                  { "ID": [{ "_": BUSINESS_REG, "schemeID": "BRN" }] },
                ],
                "PartyName": [{ "Name": [{ "_": invoice.tenant.name }] }],
                "PostalAddress": [
                  {
                    "CityName": [{ "_": "Kuala Lumpur" }],
                    "CountrySubentityCode": [{ "_": "14" }],  // WP KL
                    "Country": [{ "IdentificationCode": [{ "_": "MYS" }] }],
                  },
                ],
                "PartyTaxScheme": [
                  {
                    "RegistrationName": [{ "_": invoice.tenant.name }],
                    "CompanyID": [{ "_": invoice.tenant.sstRegNo ?? "" }],
                    "TaxScheme": [{ "ID": [{ "_": "OTH", "schemeID": "UN/ECE 5153", "schemeAgencyID": "6" }] }],
                  },
                ],
              },
            ],
          },
        ],

        // Customer
        "AccountingCustomerParty": [
          {
            "Party": [
              {
                "PartyIdentification": [
                  { "ID": [{ "_": invoice.order?.customer?.sstNo ?? "EI00000000010", "schemeID": "TIN" }] },
                ],
                "PartyName": [{ "Name": [{ "_": invoice.order?.customer?.name ?? "End Consumer" }] }],
                "PostalAddress": [
                  {
                    "CityName": [{ "_": invoice.order?.deliveryAddress?.city ?? "Kuala Lumpur" }],
                    "Country": [{ "IdentificationCode": [{ "_": "MYS" }] }],
                  },
                ],
              },
            ],
          },
        ],

        // Tax total (SST 8%)
        "TaxTotal": [
          {
            "TaxAmount": [{ "_": Number(invoice.sstAmount).toFixed(2), "currencyID": "MYR" }],
            "TaxSubtotal": [
              {
                "TaxableAmount": [{ "_": Number(invoice.subtotal).toFixed(2), "currencyID": "MYR" }],
                "TaxAmount": [{ "_": Number(invoice.sstAmount).toFixed(2), "currencyID": "MYR" }],
                "TaxCategory": [
                  {
                    "ID": [{ "_": "S" }],  // S = Service Tax
                    "Percent": [{ "_": "8.00" }],
                    "TaxScheme": [{ "ID": [{ "_": "OTH", "schemeID": "UN/ECE 5153", "schemeAgencyID": "6" }] }],
                  },
                ],
              },
            ],
          },
        ],

        // Monetary totals
        "LegalMonetaryTotal": [
          {
            "LineExtensionAmount": [{ "_": Number(invoice.subtotal).toFixed(2), "currencyID": "MYR" }],
            "TaxExclusiveAmount": [{ "_": Number(invoice.subtotal).toFixed(2), "currencyID": "MYR" }],
            "TaxInclusiveAmount": [{ "_": Number(invoice.total).toFixed(2), "currencyID": "MYR" }],
            "PayableAmount": [{ "_": Number(invoice.total).toFixed(2), "currencyID": "MYR" }],
          },
        ],

        // Line items
        "InvoiceLine": invoice.lineItems.map((item: any, i: number) => ({
          "ID": [{ "_": String(i + 1) }],
          "InvoicedQuantity": [{ "_": item.qty, "unitCode": "C62" }],
          "LineExtensionAmount": [{ "_": Number(item.total).toFixed(2), "currencyID": "MYR" }],
          "TaxTotal": [
            {
              "TaxAmount": [{ "_": (Number(item.total) * 0.08).toFixed(2), "currencyID": "MYR" }],
              "TaxSubtotal": [
                {
                  "TaxableAmount": [{ "_": Number(item.total).toFixed(2), "currencyID": "MYR" }],
                  "TaxAmount": [{ "_": (Number(item.total) * 0.08).toFixed(2), "currencyID": "MYR" }],
                  "TaxCategory": [
                    {
                      "ID": [{ "_": "S" }],
                      "Percent": [{ "_": "8.00" }],
                      "TaxScheme": [{ "ID": [{ "_": "OTH", "schemeID": "UN/ECE 5153", "schemeAgencyID": "6" }] }],
                    },
                  ],
                },
              ],
            },
          ],
          "Item": [
            {
              "CommodityClassification": [
                { "ItemClassificationCode": [{ "_": "004900", "listID": "CLASS" }] },
              ],
              "Description": [{ "_": item.description }],
            },
          ],
          "Price": [
            {
              "PriceAmount": [{ "_": Number(item.unitPrice).toFixed(2), "currencyID": "MYR" }],
            },
          ],
        })),
      },
    ],
  };
}
