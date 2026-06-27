import type { AdminApiContext } from "@shopify/shopify-app-remix/server";
import type { ColorLibraryEntry, DisplayType } from "@prisma/client";
import prisma from "../db.server";
import {
  METAFIELD_KEYS,
  setShopMetafield,
} from "./metafields.server";
import { guessHex } from "../lib/colorNames";
import type { ParsedLibraryRow } from "../lib/csv";

type Admin = { graphql: AdminApiContext["graphql"] };

/** Normalize a color/value name for stable map keys + lookups. */
export function normName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export async function listLibrary(shop: string): Promise<ColorLibraryEntry[]> {
  return prisma.colorLibraryEntry.findMany({
    where: { shop },
    orderBy: { name: "asc" },
  });
}

export async function upsertEntry(
  shop: string,
  entry: {
    name: string;
    hex?: string | null;
    hex2?: string | null;
    imageUrl?: string | null;
    source?: "CSV" | "NATIVE" | "MANUAL";
  },
): Promise<ColorLibraryEntry> {
  const name = entry.name.trim();
  return prisma.colorLibraryEntry.upsert({
    where: { shop_name: { shop, name } },
    create: {
      shop,
      name,
      hex: entry.hex ?? null,
      hex2: entry.hex2 ?? null,
      imageUrl: entry.imageUrl ?? null,
      source: entry.source ?? "MANUAL",
    },
    update: {
      hex: entry.hex ?? null,
      hex2: entry.hex2 ?? null,
      imageUrl: entry.imageUrl ?? null,
      ...(entry.source ? { source: entry.source } : {}),
    },
  });
}

export async function deleteEntry(shop: string, id: string): Promise<void> {
  await prisma.colorLibraryEntry.deleteMany({ where: { shop, id } });
}

/** Build the normalized name -> color map written to the shop metafield. */
export async function compileColorLibrary(
  shop: string,
): Promise<Record<string, { hex?: string; hex2?: string; imageUrl?: string }>> {
  const entries = await listLibrary(shop);
  const map: Record<string, { hex?: string; hex2?: string; imageUrl?: string }> =
    {};
  for (const e of entries) {
    const v: { hex?: string; hex2?: string; imageUrl?: string } = {};
    if (e.hex) v.hex = e.hex;
    if (e.hex2) v.hex2 = e.hex2;
    if (e.imageUrl) v.imageUrl = e.imageUrl;
    map[normName(e.name)] = v;
  }
  return map;
}

/** Publish the color library to the shop-owned metafield. */
export async function publishColorLibrary(
  admin: Admin,
  shop: string,
): Promise<void> {
  const map = await compileColorLibrary(shop);
  await setShopMetafield(admin, METAFIELD_KEYS.shopColorLibrary, map);
}

/**
 * Seed default option-type mappings (Color/Colour -> color swatches) the first
 * time, so the global library renders on storefronts without extra setup.
 */
export async function seedDefaultOptionTypes(shop: string): Promise<void> {
  const count = await prisma.optionTypeMapping.count({ where: { shop } });
  if (count > 0) return;
  await prisma.optionTypeMapping.createMany({
    data: [
      { shop, optionName: "Color", displayType: "color" },
      { shop, optionName: "Colour", displayType: "color" },
    ],
    skipDuplicates: true,
  });
}

export async function getOptionTypeMappings(shop: string) {
  return prisma.optionTypeMapping.findMany({
    where: { shop },
    orderBy: { optionName: "asc" },
  });
}

/** Replace the full set of option-name -> display-type mappings for a shop. */
export async function setOptionTypeMappings(
  shop: string,
  mappings: { optionName: string; displayType: DisplayType }[],
): Promise<void> {
  const clean = mappings
    .map((m) => ({
      optionName: m.optionName.trim(),
      displayType: m.displayType,
    }))
    .filter((m) => m.optionName !== "");
  // de-dup by option name (last wins)
  const byName = new Map<string, DisplayType>();
  for (const m of clean) byName.set(m.optionName, m.displayType);

  await prisma.$transaction([
    prisma.optionTypeMapping.deleteMany({ where: { shop } }),
    ...(byName.size > 0
      ? [
          prisma.optionTypeMapping.createMany({
            data: Array.from(byName, ([optionName, displayType]) => ({
              shop,
              optionName,
              displayType,
            })),
            skipDuplicates: true,
          }),
        ]
      : []),
  ]);
}

/** Update the global swatch styling tokens. */
export async function updateSwatchStyle(
  shop: string,
  style: { shape?: string; size?: number },
): Promise<void> {
  await prisma.shopSettings.update({
    where: { shop },
    data: {
      ...(style.shape ? { swatchShape: style.shape } : {}),
      ...(typeof style.size === "number" ? { swatchSize: style.size } : {}),
    },
  });
}

/** Compile the global settings metafield (option types + styling defaults). */
export async function compileGlobal(shop: string) {
  const settings = await prisma.shopSettings.findUnique({ where: { shop } });
  const mappings = await prisma.optionTypeMapping.findMany({ where: { shop } });
  return {
    version: 1 as const,
    optionTypes: mappings.map((m) => ({ name: m.optionName, type: m.displayType })),
    shape: settings?.swatchShape ?? "circle",
    size: settings?.swatchSize ?? 36,
    showPrice: settings?.showPrice ?? false,
  };
}

/** Publish the global settings to the shop-owned metafield. */
export async function publishGlobal(admin: Admin, shop: string): Promise<void> {
  const global = await compileGlobal(shop);
  await setShopMetafield(admin, METAFIELD_KEYS.shopGlobal, global);
}

/** Publish both shop-level metafields. */
export async function publishShopConfig(
  admin: Admin,
  shop: string,
): Promise<void> {
  await publishGlobal(admin, shop);
  await publishColorLibrary(admin, shop);
}

export interface ImportResult {
  imported: number;
  jobId: string;
}

/** Commit validated CSV rows into the library + record an ImportJob. */
export async function importLibraryRows(
  admin: Admin,
  shop: string,
  fileName: string,
  valid: ParsedLibraryRow[],
  invalid: ParsedLibraryRow[],
): Promise<ImportResult> {
  const job = await prisma.importJob.create({
    data: {
      shop,
      fileName,
      status: "RUNNING",
      totalRows: valid.length + invalid.length,
      errorRows: invalid.length,
      errorReportJson: invalid.length ? JSON.stringify(invalid) : null,
    },
  });

  let processed = 0;
  for (const row of valid) {
    await upsertEntry(shop, {
      name: row.name,
      hex: row.hex ?? null,
      imageUrl: row.imageUrl ?? null,
      source: "CSV",
    });
    processed++;
  }

  await prisma.importJob.update({
    where: { id: job.id },
    data: { status: "DONE", processedRows: processed },
  });

  await publishColorLibrary(admin, shop);
  return { imported: processed, jobId: job.id };
}

/**
 * Scan the store's products for option values under color-typed options and add
 * any missing names to the library (with a best-effort guessed hex). Bounded to
 * a sane number of pages to stay fast.
 */
export async function autoSyncFromProducts(
  admin: Admin,
  shop: string,
  maxPages = 6,
): Promise<{ added: number; scanned: number }> {
  // Which option names are color-typed?
  const mappings = await prisma.optionTypeMapping.findMany({ where: { shop } });
  const colorOptionNames = new Set(
    mappings
      .filter((m) => m.displayType === "color")
      .map((m) => normName(m.optionName)),
  );
  // Always include the obvious defaults.
  colorOptionNames.add("color");
  colorOptionNames.add("colour");

  const existing = new Set(
    (await listLibrary(shop)).map((e) => normName(e.name)),
  );

  const found = new Map<string, string>(); // normName -> original label
  let cursor: string | null = null;
  let scanned = 0;

  for (let page = 0; page < maxPages; page++) {
    const res = await admin.graphql(
      `#graphql
        query SwatchboxAutoSync($cursor: String) {
          products(first: 50, after: $cursor) {
            pageInfo { hasNextPage endCursor }
            nodes { options { name optionValues { name } } }
          }
        }`,
      { variables: { cursor } },
    );
    const body: any = await res.json();
    const conn: any = body.data?.products;
    if (!conn) break;
    for (const node of conn.nodes ?? []) {
      scanned++;
      for (const opt of node.options ?? []) {
        if (!colorOptionNames.has(normName(opt.name))) continue;
        for (const ov of opt.optionValues ?? []) {
          const key = normName(ov.name);
          if (!existing.has(key) && !found.has(key)) {
            found.set(key, ov.name);
          }
        }
      }
    }
    if (!conn.pageInfo?.hasNextPage) break;
    cursor = conn.pageInfo.endCursor;
  }

  let added = 0;
  for (const [, label] of found) {
    await upsertEntry(shop, {
      name: label,
      hex: guessHex(label),
      source: "NATIVE",
    });
    added++;
  }

  if (added > 0) await publishColorLibrary(admin, shop);
  return { added, scanned };
}
