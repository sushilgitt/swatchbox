import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";

/**
 * GDPR: customers/data_request. Shopify sends this when a customer requests
 * their stored data. Swatchbox stores no customer PII (only shop settings,
 * swatch configs and the color library), so there is nothing to return — we
 * acknowledge with 200. `authenticate.webhook` verifies the HMAC signature and
 * responds 401 on an invalid/missing signature.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop} (no customer data stored)`);
  return new Response();
};
