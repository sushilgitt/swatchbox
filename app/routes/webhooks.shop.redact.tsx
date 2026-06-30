import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import db from "../db.server";

/**
 * GDPR: shop/redact. Sent ~48h after a shop uninstalls the app, requesting
 * deletion of the shop's data. We purge every Swatchbox row for this shop.
 * `authenticate.webhook` verifies the HMAC signature (401 on a bad signature).
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop} — purging shop data`);

  const where = { where: { shop } };
  await db.$transaction([
    db.productConfig.deleteMany(where),
    db.swatchValue.deleteMany(where),
    db.colorLibraryEntry.deleteMany(where),
    db.optionTypeMapping.deleteMany(where),
    db.badgeDefinition.deleteMany(where),
    db.importJob.deleteMany(where),
    db.shopSettings.deleteMany(where),
    db.session.deleteMany(where),
  ]);

  return new Response();
};
