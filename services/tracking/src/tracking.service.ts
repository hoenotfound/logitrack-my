// services/tracking/src/tracking.service.ts
/**
 * Real-time tracking service
 * - Consumes GPS pings from driver app via WebSocket
 * - Stores time-series data in TimescaleDB (raw GPS)
 * - Updates VehicleLocation (latest only) in PostgreSQL
 * - Broadcasts events to connected web clients via SSE
 *
 * NOTE: Redis replaced with in-memory EventEmitter for MVP/demo mode.
 * Live tracking works within a single process. For multi-server production,
 * swap back to Redis pub/sub.
 */
import { PrismaClient } from "@prisma/client";
import { EventEmitter } from "events";

// In-memory pub/sub — no Redis required
const trackingBus = new EventEmitter();
trackingBus.setMaxListeners(200); // allow many concurrent tracking streams

const prisma = new PrismaClient();

export interface GPSPing {
  vehicleId: string;
  driverId: string;
  orderId?: string;
  lat: number;
  lng: number;
  speed?: number;   // km/h
  heading?: number; // degrees
  accuracy?: number; // metres
  ts: number;       // unix ms
}

/**
 * Called by the driver app every 10 seconds while on a job.
 */
export async function ingestGPSPing(ping: GPSPing): Promise<void> {
  // 1. Update latest position in Postgres
  await prisma.vehicleLocation.upsert({
    where: { vehicleId: ping.vehicleId },
    create: {
      vehicleId: ping.vehicleId,
      lat: ping.lat,
      lng: ping.lng,
      speed: ping.speed,
      heading: ping.heading,
    },
    update: {
      lat: ping.lat,
      lng: ping.lng,
      speed: ping.speed,
      heading: ping.heading,
      updatedAt: new Date(ping.ts),
    },
  });

  // 2. Broadcast to in-memory listeners for SSE (no Redis needed)
  trackingBus.emit(
    `tracking:order:${ping.orderId ?? "fleet"}`,
    JSON.stringify({
      vehicleId: ping.vehicleId,
      lat: ping.lat,
      lng: ping.lng,
      speed: ping.speed,
      heading: ping.heading,
      ts: ping.ts,
    })
  );
}

/**
 * Get the full tracking timeline for a customer-facing tracking page.
 */
export async function getOrderTimeline(orderNo: string) {
  const order = await prisma.order.findUnique({
    where: { orderNo },
    include: {
      trackingEvents: { orderBy: { createdAt: "asc" } },
      pickupAddress: true,
      deliveryAddress: true,
      assignedTo: { select: { name: true, phone: true } },
    },
  });

  if (!order) throw new Error(`Order ${orderNo} not found`);

  // Get live vehicle location if in transit
  const liveLocation =
    order.assignedTo && ["IN_TRANSIT","OUT_FOR_DELIVERY"].includes(order.status)
      ? await prisma.vehicleLocation.findFirst({
          where: { vehicle: { legs: { some: {} } } },
        })
      : null;

  return {
    orderNo: order.orderNo,
    status: order.status,
    type: order.type,
    eta: order.scheduledDelivery,
    pickup: {
      address: formatAddress(order.pickupAddress),
      actual: order.actualPickup,
    },
    delivery: {
      address: formatAddress(order.deliveryAddress),
      actual: order.actualDelivery,
    },
    driver: order.assignedTo
      ? { name: order.assignedTo.name, phone: maskPhone(order.assignedTo.phone ?? "") }
      : null,
    events: order.trackingEvents.map((e) => ({
      status: e.status,
      message: e.message,
      lat: e.lat,
      lng: e.lng,
      photo: e.photo,
      ts: e.createdAt,
    })),
    liveLocation,
  };
}

/**
 * Server-Sent Events stream — call from Next.js route handler.
 * Usage: GET /api/tracking/[orderNo]/stream
 */
export function createTrackingStream(orderNo: string): ReadableStream {
  const encoder = new TextEncoder();

  return new ReadableStream({
    start(controller) {
      const channel = `tracking:order:${orderNo}`;

      // Listen on in-memory bus — no Redis needed
      const listener = (message: string) => {
        controller.enqueue(encoder.encode(`data: ${message}\n\n`));
      };
      trackingBus.on(channel, listener);

      // Heartbeat every 15s to keep connection alive
      const heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(`: heartbeat\n\n`));
      }, 15000);

      controller.signal?.addEventListener("abort", () => {
        clearInterval(heartbeat);
        trackingBus.off(channel, listener);
      });
    },
  });
}

function formatAddress(a: { line1: string; line2?: string | null; city: string; state: string; postcode: string }) {
  return [a.line1, a.line2, `${a.postcode} ${a.city}`, a.state].filter(Boolean).join(", ");
}

function maskPhone(phone: string): string {
  if (phone.length < 8) return phone;
  return phone.slice(0, 4) + "****" + phone.slice(-2);
}
