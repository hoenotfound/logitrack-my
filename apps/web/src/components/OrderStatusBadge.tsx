const STATUS_STYLES: Record<string, string> = {
  PENDING:           "bg-yellow-100 text-yellow-800",
  CONFIRMED:         "bg-blue-100 text-blue-800",
  PICKED_UP:         "bg-indigo-100 text-indigo-800",
  IN_TRANSIT:        "bg-purple-100 text-purple-800",
  OUT_FOR_DELIVERY:  "bg-orange-100 text-orange-800",
  DELIVERED:         "bg-green-100 text-green-800",
  FAILED_ATTEMPT:    "bg-red-100 text-red-800",
  RETURNED:          "bg-gray-100 text-gray-800",
  CANCELLED:         "bg-gray-100 text-gray-500",
};

const STATUS_LABELS: Record<string, string> = {
  PENDING:           "Pending",
  CONFIRMED:         "Confirmed",
  PICKED_UP:         "Picked Up",
  IN_TRANSIT:        "In Transit",
  OUT_FOR_DELIVERY:  "Out for Delivery",
  DELIVERED:         "Delivered",
  FAILED_ATTEMPT:    "Failed Attempt",
  RETURNED:          "Returned",
  CANCELLED:         "Cancelled",
};

export function OrderStatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? "bg-gray-100 text-gray-600";
  const label = STATUS_LABELS[status] ?? status;

  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${style}`}>
      {label}
    </span>
  );
}
