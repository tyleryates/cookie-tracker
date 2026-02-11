// Runtime validators for external data at the JSON parse boundary.
// Warn-only — issues are logged but don't block imports (graceful degradation).

import { z } from 'zod';

interface ValidationResult {
  valid: boolean;
  issues: string[];
}

function fromZodResult(result: {
  success: boolean;
  error?: { issues: Array<{ path: PropertyKey[]; message: string }> };
}): ValidationResult {
  if (result.success) return { valid: true, issues: [] };
  const issues = (result.error?.issues ?? []).map((i) => `${i.path.map(String).join('.')}: ${i.message}`);
  return { valid: false, issues };
}

// ============================================================================
// Smart Cookie API schema
// ============================================================================

const scOrderSchema = z
  .object({
    order_number: z.union([z.string(), z.number()])
  })
  .passthrough();

const scDataSchema = z
  .object({
    orders: z.array(scOrderSchema),
    directShipDivider: z.record(z.string(), z.unknown()).optional(),
    reservations: z
      .object({ reservations: z.array(z.unknown()) })
      .passthrough()
      .optional(),
    cookieIdMap: z.record(z.string(), z.unknown()).optional()
  })
  .passthrough();

/** Validate Smart Cookie API JSON data shape */
export function validateSCData(data: unknown): ValidationResult {
  return fromZodResult(scDataSchema.safeParse(data));
}

// ============================================================================
// Digital Cookie schema
// ============================================================================

const dcHeadersSchema = z
  .object({
    'Girl First Name': z.string(),
    'Order #': z.string()
  })
  .passthrough();

/** Validate Digital Cookie Excel data shape (parsed rows) — checks first row headers only */
export function validateDCData(data: unknown): ValidationResult {
  if (!Array.isArray(data) || data.length === 0) {
    return { valid: false, issues: ['DC data is empty or not an array'] };
  }
  return fromZodResult(dcHeadersSchema.safeParse(data[0]));
}
