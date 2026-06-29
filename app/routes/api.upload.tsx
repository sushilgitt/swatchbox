import type { ActionFunctionArgs } from "@remix-run/node";
import {
  json,
  unstable_createMemoryUploadHandler,
  unstable_parseMultipartFormData,
} from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { uploadImageToShopifyFiles } from "../models/files.server";
import { getPlanStatus } from "../models/billing.server";

/**
 * Resource route for image-swatch uploads. The embedded admin posts a single
 * `file` field here; App Bridge attaches the session token to the request.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, billing } = await authenticate.admin(request);

  const { isPro } = await getPlanStatus(billing);
  if (!isPro) {
    return json(
      { ok: false, error: "Image swatches are a Pro feature.", upgrade: true },
      { status: 402 },
    );
  }

  const uploadHandler = unstable_createMemoryUploadHandler({
    maxPartSize: 8_000_000, // 8 MB
  });
  const form = await unstable_parseMultipartFormData(request, uploadHandler);
  const file = form.get("file");

  if (!file || typeof file === "string") {
    return json({ ok: false, error: "No file provided" }, { status: 400 });
  }
  const f = file as File;
  if (!f.type.startsWith("image/")) {
    return json({ ok: false, error: "File must be an image" }, { status: 400 });
  }

  try {
    const buffer = Buffer.from(await f.arrayBuffer());
    const result = await uploadImageToShopifyFiles(admin, {
      filename: f.name || "swatch.png",
      mimeType: f.type,
      buffer,
    });
    return json({ ok: true, url: result.url });
  } catch (e) {
    return json(
      { ok: false, error: e instanceof Error ? e.message : "Upload failed" },
      { status: 500 },
    );
  }
};
