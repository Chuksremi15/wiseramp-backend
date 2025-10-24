import { randomBytes } from "crypto";

/**
 * Generates a unique reference string for transactions
 * Format: PREFIX_TIMESTAMP_RANDOM
 * @param prefix - Optional prefix for the reference (default: 'REF')
 * @param length - Length of random part (default: 8)
 * @returns Unique reference string
 */
export function generateUniqueReference(
  prefix: string = "REF",
  length: number = 8
): string {
  const timestamp = Date.now().toString();
  const randomPart = randomBytes(Math.ceil(length / 2))
    .toString("hex")
    .slice(0, length)
    .toUpperCase();

  return `${prefix}_${timestamp}_${randomPart}`;
}

/**
 * Generates a simple alphanumeric reference
 * @param length - Length of the reference (default: 12)
 * @returns Alphanumeric reference string
 */
export function generateAlphanumericReference(length: number = 12): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";

  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return result;
}

/**
 * Generates a reference specifically for Monify account references
 * Format: Alphanumeric, 10-15 characters
 * @returns Monify-compatible reference string
 */
export function generateMonifyReference(): string {
  return generateAlphanumericReference(12);
}
