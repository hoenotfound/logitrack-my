/**
 * Format a number as Malaysian Ringgit
 * e.g. 1234.5 → "RM 1,234.50"
 */
export function formatMYR(amount: number): string {
  return new Intl.NumberFormat("en-MY", {
    style: "currency",
    currency: "MYR",
    minimumFractionDigits: 2,
  }).format(amount);
}

/**
 * Normalise a Malaysian phone number to +60 format
 * e.g. "0123456789" → "+60123456789"
 */
export function normaliseMYPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("60")) return `+${digits}`;
  if (digits.startsWith("0")) return `+6${digits}`;
  return `+60${digits}`;
}

/**
 * Check if a postcode is in East Malaysia (Sabah/Sarawak)
 * Used for remote area surcharge detection
 */
export function isEastMalaysia(postcode: string): boolean {
  const code = parseInt(postcode, 10);
  return (code >= 88000 && code <= 91300) || // Sabah
         (code >= 93000 && code <= 98859);   // Sarawak
}
