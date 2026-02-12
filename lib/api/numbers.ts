/**
 * Shared helpers for normalizing and validating numeric data coming from
 * Prisma, spreadsheets, query strings, or other untyped sources.
 */

export type DecimalLike = {
  toNumber(): number;
};

/**
 * Runtime guard that recognises Prisma Decimal instances (and compatible
 * implementations) without importing the Prisma client in API layer helpers.
 */
export function isDecimalLike(value: unknown): value is DecimalLike {
  return (
    typeof value === "object" &&
    value !== null &&
    "toNumber" in value &&
    typeof (value as Record<string, unknown>).toNumber === "function"
  );
}

/**
 * Convert unknown input to a finite number.
 *
 * @param value - Input that may be a number, string, bigint, Decimal, or nullish.
 * @param fallback - Value returned when conversion is not possible.
 */
export function toFiniteNumber(value: unknown, fallback = 0): number {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : fallback;
  }

  if (typeof value === "bigint") {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return fallback;
    }
    const numeric = Number(trimmed);
    return Number.isFinite(numeric) ? numeric : fallback;
  }

  if (isDecimalLike(value)) {
    try {
      const numeric = value.toNumber();
      return Number.isFinite(numeric) ? numeric : fallback;
    } catch {
      return fallback;
    }
  }

  return fallback;
}

/**
 * Mirrors {@link toFiniteNumber} but returns `null` instead of a fallback when
 * the input cannot be converted.
 */
export function toNullableNumber(value: unknown): number | null {
  const numeric = toFiniteNumber(value, Number.NaN);
  return Number.isFinite(numeric) ? numeric : null;
}

/**
 * Ensure that a value can be converted to a finite number, otherwise throw.
 */
export function requireNumber(value: unknown, message: string): number {
  const numeric = toNullableNumber(value);
  if (numeric === null) {
    throw new Error(message);
  }
  return numeric;
}

/**
 * Parse integer query parameters with bounds enforcement.
 */
export function parseBoundedInteger(
  raw: string | null,
  fallback: number,
  min: number,
  max: number,
): number {
  if (raw === null || raw.trim().length === 0) {
    return clampInteger(fallback, min, max);
  }

  const parsed = Number(raw);
  if (!Number.isInteger(parsed)) {
    return clampInteger(fallback, min, max);
  }

  return clampInteger(parsed, min, max);
}

function clampInteger(value: number, min: number, max: number): number {
  const integer = Number.isInteger(value) ? value : Math.round(value);
  if (integer < min) return min;
  if (integer > max) return max;
  return integer;
}
