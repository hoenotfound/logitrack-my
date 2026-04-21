// services/notifications/src/notify.ts
/**
 * Notification service — WhatsApp (360dialog / Meta API) + email (Postmark)
 * Uses Malaysia-localised message templates (Bahasa Malaysia + English)
 */

const WA_API = process.env.WA_API_URL!;
const WA_TOKEN = process.env.WA_API_TOKEN!;
const POSTMARK_TOKEN = process.env.POSTMARK_TOKEN!;

type NotificationEvent =
  | { type: "ORDER_CREATED"; orderNo: string; estimatedDelivery?: Date }
  | { type: "STATUS_UPDATE"; orderNo: string; status: string }
  | { type: "DRIVER_ASSIGNED"; orderNo: string; driverName: string; driverPhone: string }
  | { type: "DELIVERY_FAILED"; orderNo: string; reason?: string }
  | { type: "INVOICE_ISSUED"; invoiceNo: string; amount: number; dueDate: Date };

export async function notifyCustomer(customerId: string, event: NotificationEvent) {
  const customer = await getCustomerContact(customerId);
  if (!customer) return;

  const { message, subject, html } = buildMessage(event, customer.name);

  // WhatsApp (preferred for Malaysia)
  if (customer.phone) {
    await sendWhatsApp(customer.phone, message).catch((e) =>
      console.warn("WhatsApp notification failed:", e)
    );
  }

  // Email as fallback
  if (customer.email) {
    await sendEmail({ to: customer.email, subject, html }).catch((e) =>
      console.warn("Email notification failed:", e)
    );
  }
}

async function sendWhatsApp(phone: string, message: string) {
  // Normalize to Malaysian format: +60XXXXXXXXX
  const normalised = normalizePhone(phone);

  await fetch(`${WA_API}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "D360-API-KEY": WA_TOKEN,
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: normalised,
      type: "text",
      text: { body: message },
    }),
  });
}

async function sendEmail(opts: { to: string; subject: string; html: string }) {
  await fetch("https://api.postmarkapp.com/email", {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json",
      "X-Postmark-Server-Token": POSTMARK_TOKEN,
    },
    body: JSON.stringify({
      From: "noreply@logitrack.my",
      To: opts.to,
      Subject: opts.subject,
      HtmlBody: opts.html,
      MessageStream: "outbound",
    }),
  });
}

function buildMessage(event: NotificationEvent, name: string): { message: string; subject: string; html: string } {
  switch (event.type) {
    case "ORDER_CREATED":
      return {
        subject: `Order ${event.orderNo} confirmed — LogiTrack`,
        message: `Hi ${name},\n\nYour order *${event.orderNo}* has been received.${event.estimatedDelivery ? ` Estimated delivery: ${formatDate(event.estimatedDelivery)}.` : ""}\n\nTrack at: https://track.logitrack.my/${event.orderNo}`,
        html: emailTemplate(`Order ${event.orderNo} confirmed`, `<p>Hi ${name},</p><p>Your order <strong>${event.orderNo}</strong> has been received and is being processed.</p>`),
      };
    case "STATUS_UPDATE":
      return {
        subject: `Update on ${event.orderNo} — ${humanStatus(event.status)}`,
        message: `Hi ${name},\n\n*${event.orderNo}*: ${humanStatus(event.status)}\n\nTrack at: https://track.logitrack.my/${event.orderNo}`,
        html: emailTemplate(`Order update`, `<p>Hi ${name},</p><p>Your order <strong>${event.orderNo}</strong> status: <strong>${humanStatus(event.status)}</strong></p>`),
      };
    case "DRIVER_ASSIGNED":
      return {
        subject: `Driver assigned for ${event.orderNo}`,
        message: `Hi ${name},\n\nYour driver for order *${event.orderNo}* is *${event.driverName}*.\nContact: ${event.driverPhone}`,
        html: emailTemplate(`Driver assigned`, `<p>Hi ${name},</p><p>Driver <strong>${event.driverName}</strong> has been assigned to your order.</p>`),
      };
    case "DELIVERY_FAILED":
      return {
        subject: `Delivery attempt failed — ${event.orderNo}`,
        message: `Hi ${name},\n\nWe were unable to deliver *${event.orderNo}*${event.reason ? `: ${event.reason}` : ""}. We will retry within 1 business day.`,
        html: emailTemplate(`Delivery attempt failed`, `<p>Hi ${name},</p><p>We were unable to complete the delivery for <strong>${event.orderNo}</strong>. We will retry within 1 business day.</p>`),
      };
    case "INVOICE_ISSUED":
      return {
        subject: `Invoice ${event.invoiceNo} — RM${event.amount.toFixed(2)} due ${formatDate(event.dueDate)}`,
        message: `Hi ${name},\n\nInvoice *${event.invoiceNo}* for *RM${event.amount.toFixed(2)}* has been issued, due ${formatDate(event.dueDate)}.`,
        html: emailTemplate(`Invoice issued`, `<p>Hi ${name},</p><p>Invoice <strong>${event.invoiceNo}</strong> for <strong>RM${event.amount.toFixed(2)}</strong> is due by ${formatDate(event.dueDate)}.</p>`),
      };
  }
}

function humanStatus(status: string): string {
  return status.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" });
}

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("0")) return "+60" + digits.slice(1);
  if (digits.startsWith("60")) return "+" + digits;
  return phone;
}

function emailTemplate(heading: string, body: string): string {
  return `<!DOCTYPE html><html><body style="font-family:sans-serif;color:#1a1a1a;max-width:600px;margin:auto;padding:24px"><h2 style="color:#2563eb">${heading}</h2>${body}<hr><p style="font-size:12px;color:#888">LogiTrack MY &bull; <a href="https://logitrack.my">logitrack.my</a></p></body></html>`;
}

async function getCustomerContact(_customerId: string): Promise<{ phone?: string; email?: string; name: string } | null> {
  // Stub — wire up to prisma.customer.findUnique in production
  return null;
}
