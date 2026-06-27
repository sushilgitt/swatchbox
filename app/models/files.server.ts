import type { AdminApiContext } from "@shopify/shopify-app-remix/server";

type Admin = { graphql: AdminApiContext["graphql"] };

const STAGED_UPLOADS = `#graphql
  mutation SwatchboxStagedUploads($input: [StagedUploadInput!]!) {
    stagedUploadsCreate(input: $input) {
      stagedTargets { url resourceUrl parameters { name value } }
      userErrors { field message }
    }
  }`;

const FILE_CREATE = `#graphql
  mutation SwatchboxFileCreate($files: [FileCreateInput!]!) {
    fileCreate(files: $files) {
      files {
        id
        fileStatus
        ... on MediaImage { image { url } }
      }
      userErrors { field message }
    }
  }`;

const FILE_STATUS = `#graphql
  query SwatchboxFileStatus($id: ID!) {
    node(id: $id) {
      ... on MediaImage { id fileStatus image { url } }
    }
  }`;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface UploadedImage {
  id: string;
  url: string;
}

/**
 * Upload an image to Shopify Files and return its CDN URL.
 * Flow: stagedUploadsCreate -> POST the bytes to the signed target ->
 * fileCreate -> poll until the processed image URL is available.
 */
export async function uploadImageToShopifyFiles(
  admin: Admin,
  file: { filename: string; mimeType: string; buffer: Buffer },
): Promise<UploadedImage> {
  // 1. Get a signed upload target.
  const stagedRes = await admin.graphql(STAGED_UPLOADS, {
    variables: {
      input: [
        {
          resource: "IMAGE",
          filename: file.filename,
          mimeType: file.mimeType,
          httpMethod: "POST",
          fileSize: String(file.buffer.length),
        },
      ],
    },
  });
  const stagedBody: any = await stagedRes.json();
  const staged = stagedBody?.data?.stagedUploadsCreate;
  if (staged?.userErrors?.length) {
    throw new Error(staged.userErrors.map((e: any) => e.message).join("; "));
  }
  const target = staged?.stagedTargets?.[0];
  if (!target?.url) throw new Error("No staged upload target returned");

  // 2. Upload the bytes to the signed target (GCS multipart form).
  const form = new FormData();
  for (const p of target.parameters as { name: string; value: string }[]) {
    form.append(p.name, p.value);
  }
  form.append(
    "file",
    new Blob([new Uint8Array(file.buffer)], { type: file.mimeType }),
    file.filename,
  );
  const uploadRes = await fetch(target.url, { method: "POST", body: form });
  if (!uploadRes.ok) {
    throw new Error(`Staged upload failed (${uploadRes.status})`);
  }

  // 3. Register the file in Shopify Files.
  const createRes = await admin.graphql(FILE_CREATE, {
    variables: {
      files: [{ originalSource: target.resourceUrl, contentType: "IMAGE" }],
    },
  });
  const createBody: any = await createRes.json();
  const created = createBody?.data?.fileCreate;
  if (created?.userErrors?.length) {
    throw new Error(created.userErrors.map((e: any) => e.message).join("; "));
  }
  const created0 = created?.files?.[0];
  if (!created0?.id) throw new Error("fileCreate returned no file");

  let url: string | null = created0.image?.url ?? null;
  const id: string = created0.id;

  // 4. Poll until Shopify finishes processing the image.
  for (let i = 0; i < 8 && !url; i++) {
    await sleep(700);
    const statusRes = await admin.graphql(FILE_STATUS, { variables: { id } });
    const statusBody: any = await statusRes.json();
    url = statusBody?.data?.node?.image?.url ?? null;
  }

  if (!url) {
    // File was created but not yet processed; surface the id so the caller can
    // decide. We throw so the UI shows a retriable error rather than a blank.
    throw new Error("Image uploaded but still processing — try again shortly");
  }
  return { id, url };
}
