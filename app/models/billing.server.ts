import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { PRO_PLAN } from "../lib/plans";

// Re-export for server callers that already import from here.
export { PRO_PLAN, FREE_DISPLAY_TYPES, isFreeDisplayType } from "../lib/plans";

/**
 * Billing mode. Real (live) charges in production; test charges in development.
 * Override explicitly with SHOPIFY_BILLING_TEST=true|false (e.g. set "true" to
 * test the upgrade flow on a development store, which cannot take real charges).
 */
export const BILLING_TEST =
  process.env.SHOPIFY_BILLING_TEST != null
    ? process.env.SHOPIFY_BILLING_TEST !== "false"
    : process.env.NODE_ENV !== "production";

// The billing context returned by authenticate.admin.
type Billing = Awaited<ReturnType<typeof authenticate.admin>>["billing"];

export interface PlanStatus {
  isPro: boolean;
  subscriptions: { id: string; name: string; status: string }[];
}

/** Whether the shop has an active Pro subscription. */
export async function getPlanStatus(billing: Billing): Promise<PlanStatus> {
  // `as never` works around a duplicate-@shopify/shopify-api type clash that
  // collapses the plan-name union to `never`; the runtime value is correct.
  const res = await billing.check({
    plans: [PRO_PLAN] as never,
    isTest: BILLING_TEST,
  });
  const subs = (res.appSubscriptions || []) as {
    id: string;
    name: string;
    status: string;
  }[];
  return { isPro: res.hasActivePayment, subscriptions: subs };
}

/**
 * Guard for Pro-only actions. Returns a 402 JSON response if the shop is on the
 * Free plan; returns null when allowed (caller proceeds).
 */
export async function requirePro(billing: Billing) {
  const { isPro } = await getPlanStatus(billing);
  if (!isPro) {
    return json(
      { ok: false, error: "This is a Pro feature. Upgrade to use it.", upgrade: true },
      { status: 402 },
    );
  }
  return null;
}
