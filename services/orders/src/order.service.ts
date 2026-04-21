// services/orders/src/order.service.ts
import { PrismaClient, Order, OrderStatus, OrderType, Priority } from "@prisma/client";
import { generateOrderNumber } from "@logitrack/utils";
import { notifyCustomer } from "../notifications/notify";

const prisma = new PrismaClient();

export interface CreateOrderInput {
  tenantId: string;
  customerId: string;
  createdById: string;
  type: OrderType;
  priority?: Priority;
  pickupAddressId: string;
  deliveryAddressId: string;
  scheduledPickup?: Date;
  scheduledDelivery?: Date;
  items: {
    description: string;
    hsCode?: string;
    qty: number;
    unitWeight: number;
    length?: number;
    width?: number;
    height?: number;
    unitValue: number;
  }[];
  codAmount?: number;
  declaredValue?: number;
  insurance?: boolean;
  notes?: string;
}

export async function createOrder(input: CreateOrderInput): Promise<Order> {
  const orderNo = await generateOrderNumber(input.tenantId);

  const order = await prisma.order.create({
    data: {
      orderNo,
      tenantId: input.tenantId,
      customerId: input.customerId,
      createdById: input.createdById,
      type: input.type,
      priority: input.priority ?? "NORMAL",
      pickupAddressId: input.pickupAddressId,
      deliveryAddressId: input.deliveryAddressId,
      scheduledPickup: input.scheduledPickup,
      scheduledDelivery: input.scheduledDelivery,
      codAmount: input.codAmount,
      declaredValue: input.declaredValue,
      insurance: input.insurance ?? false,
      notes: input.notes,
      items: {
        create: input.items,
      },
    },
    include: { items: true, customer: true, pickupAddress: true, deliveryAddress: true },
  });

  // Auto-create tracking event
  await prisma.trackingEvent.create({
    data: {
      orderId: order.id,
      status: "PENDING",
      message: `Order ${orderNo} created and awaiting confirmation.`,
    },
  });

  await notifyCustomer(order.customerId, {
    type: "ORDER_CREATED",
    orderNo,
    estimatedDelivery: input.scheduledDelivery,
  });

  return order;
}

export async function updateOrderStatus(
  orderId: string,
  newStatus: OrderStatus,
  userId: string,
  options: { lat?: number; lng?: number; photo?: string; message?: string } = {}
): Promise<Order> {
  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });

  validateStatusTransition(order.status, newStatus);

  const updated = await prisma.order.update({
    where: { id: orderId },
    data: {
      status: newStatus,
      actualPickup:
        newStatus === "PICKED_UP" ? new Date() : undefined,
      actualDelivery:
        newStatus === "DELIVERED" ? new Date() : undefined,
    },
  });

  await prisma.trackingEvent.create({
    data: {
      orderId,
      userId,
      status: newStatus,
      message: options.message ?? statusMessage(newStatus),
      lat: options.lat,
      lng: options.lng,
      photo: options.photo,
    },
  });

  await notifyCustomer(order.customerId, {
    type: "STATUS_UPDATE",
    orderNo: order.orderNo,
    status: newStatus,
  });

  return updated;
}

export async function assignDriver(orderId: string, driverId: string): Promise<Order> {
  return prisma.order.update({
    where: { id: orderId },
    data: { assignedToId: driverId, status: "CONFIRMED" },
  });
}

export async function listOrders(
  tenantId: string,
  filters: {
    status?: OrderStatus;
    type?: OrderType;
    driverId?: string;
    customerId?: string;
    from?: Date;
    to?: Date;
    page?: number;
    limit?: number;
  }
) {
  const { page = 1, limit = 20 } = filters;
  const where: any = { tenantId };

  if (filters.status) where.status = filters.status;
  if (filters.type) where.type = filters.type;
  if (filters.driverId) where.assignedToId = filters.driverId;
  if (filters.customerId) where.customerId = filters.customerId;
  if (filters.from || filters.to) {
    where.createdAt = {};
    if (filters.from) where.createdAt.gte = filters.from;
    if (filters.to) where.createdAt.lte = filters.to;
  }

  const [data, total] = await Promise.all([
    prisma.order.findMany({
      where,
      include: { customer: true, assignedTo: true, pickupAddress: true, deliveryAddress: true },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.order.count({ where }),
  ]);

  return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
}

// ─────────────────────────────────────────────
// Allowed status transitions
// ─────────────────────────────────────────────
const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING:          ["CONFIRMED", "CANCELLED"],
  CONFIRMED:        ["PICKED_UP", "CANCELLED"],
  PICKED_UP:        ["IN_TRANSIT", "AT_WAREHOUSE"],
  IN_TRANSIT:       ["AT_WAREHOUSE", "OUT_FOR_DELIVERY", "DELIVERED"],
  AT_WAREHOUSE:     ["OUT_FOR_DELIVERY"],
  OUT_FOR_DELIVERY: ["DELIVERED", "FAILED_ATTEMPT"],
  DELIVERED:        [],
  FAILED_ATTEMPT:   ["OUT_FOR_DELIVERY", "RETURNED"],
  RETURNED:         [],
  CANCELLED:        [],
};

function validateStatusTransition(current: OrderStatus, next: OrderStatus) {
  if (!TRANSITIONS[current]?.includes(next)) {
    throw new Error(`Invalid status transition: ${current} → ${next}`);
  }
}

function statusMessage(status: OrderStatus): string {
  const messages: Record<OrderStatus, string> = {
    PENDING:          "Order received.",
    CONFIRMED:        "Order confirmed. Driver assigned.",
    PICKED_UP:        "Parcel picked up from sender.",
    IN_TRANSIT:       "Parcel is in transit.",
    AT_WAREHOUSE:     "Parcel arrived at sorting facility.",
    OUT_FOR_DELIVERY: "Out for delivery.",
    DELIVERED:        "Parcel delivered successfully.",
    FAILED_ATTEMPT:   "Delivery attempt failed. Will retry.",
    RETURNED:         "Parcel returned to sender.",
    CANCELLED:        "Order cancelled.",
  };
  return messages[status] ?? "Status updated.";
}
