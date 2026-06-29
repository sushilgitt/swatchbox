/**
 * Client-safe plan constants (no server-only imports), so both browser
 * components and server code can use them. Server-only billing logic lives in
 * app/models/billing.server.ts.
 */

/** Paid plan name — must match the billing config in app/shopify.server.ts. */
export const PRO_PLAN = "Pro";

/** Display types available on the Free plan; the rest require Pro. */
export const FREE_DISPLAY_TYPES = ["color", "variant_image"] as const;

export function isFreeDisplayType(type: string): boolean {
  return (FREE_DISPLAY_TYPES as readonly string[]).includes(type);
}
