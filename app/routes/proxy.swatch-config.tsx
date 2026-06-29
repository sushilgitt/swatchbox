import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { compileGlobal, compileColorLibrary } from "../models/library.server";

/**
 * App Proxy endpoint: GET /apps/swatchbox/swatch-config
 * Serves the shop's global settings + color library as JSON. The storefront
 * script uses this as a fallback when the inline (Liquid) library isn't present
 * — e.g. an oversized color library. Shopify signs the request; we validate it.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.public.appProxy(request);
  if (!session) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }
  const shop = session.shop;
  const [global, library] = await Promise.all([
    compileGlobal(shop),
    compileColorLibrary(shop),
  ]);
  return json(
    { global, library },
    {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=60",
      },
    },
  );
};
