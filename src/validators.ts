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

const scOrdersSchema = z
  .object({
    orders: z.array(scOrderSchema)
  })
  .passthrough();

/** Validate Smart Cookie orders response shape */
export function validateSCOrders(data: unknown): ValidationResult {
  return fromZodResult(scOrdersSchema.safeParse(data));
}

// ============================================================================
// Digital Cookie schema
// ============================================================================

const dcHeadersSchema = z
  .object({
    'Girl First Name': z.string(),
    'Order Number': z.string()
  })
  .passthrough();

/** Validate Digital Cookie Excel data shape (parsed rows) — checks first row headers only */
export function validateDCData(data: unknown): ValidationResult {
  if (!Array.isArray(data) || data.length === 0) {
    return { valid: false, issues: ['DC data is empty or not an array'] };
  }
  return fromZodResult(dcHeadersSchema.safeParse(data[0]));
}

// ============================================================================
// IPC parameter schemas
// ============================================================================

const credentialEntrySchema = z
  .object({
    username: z.string().max(256).optional(),
    password: z.string().max(256).optional(),
    role: z.string().max(256).optional(),
    councilId: z.union([z.string(), z.number()]).optional()
  })
  .strict();

const credentialPatchSchema = z
  .object({
    smartCookie: credentialEntrySchema.optional(),
    digitalCookie: credentialEntrySchema.optional()
  })
  .strict();

/** Validate credential patch from IPC */
export function validateCredentialPatch(data: unknown): ValidationResult {
  return fromZodResult(credentialPatchSchema.safeParse(data));
}

const boothFinderPatchSchema = z
  .object({
    enabled: z.boolean().optional(),
    autoRefresh: z.boolean().optional(),
    imessage: z.boolean().optional(),
    imessageRecipient: z.string().max(256).optional(),
    notifiedSlots: z.array(z.string()).optional(),
    ids: z.array(z.number()).optional(),
    dayFilters: z.array(z.string()).optional(),
    ignoredSlots: z.array(z.string()).optional()
  })
  .strict()
  .optional();

const configPatchSchema = z
  .object({
    autoUpdate: z.boolean().optional(),
    autoSync: z.boolean().optional(),
    boothFinder: boothFinderPatchSchema
  })
  .strict();

/** Validate config patch from IPC */
export function validateConfigPatch(data: unknown): ValidationResult {
  return fromZodResult(configPatchSchema.safeParse(data));
}
