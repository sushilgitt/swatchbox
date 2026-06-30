import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";

/**
 * GDPR: customers/redact. Shopify sends this to request deletion of a customer's
 * data. Swatchbox stores no customer PII, so there is nothing to delete — we
 * acknowledge with 200. `authenticate.webhook` verifies the HMAC signature and
 * responds 401 on an invalid/missing signature.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop} (no customer data stored)`);
  return new Response();
};
