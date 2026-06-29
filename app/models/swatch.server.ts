import type { AdminApiContext } from "@shopify/shopify-app-remix/server";
import type { ProductConfig, ShopSettings } from "@prisma/client";
import prisma from "../db.server";
import {
  METAFIELD_KEYS,
  setJsonMetafield,
  ensureMetafieldDefinitions,
} from "./metafields.server";
import { seedDefaultOptionTypes, publishShopConfig } from "./library.server";

type Admin = { graphql: AdminApiContext["graphql"] };

export type SwatchDisplayType =
  | "color"
  | "image"
  | "variant_image"
  | "button"
  | "dropdown";

/** One option value's swatch resolution, as stored in the product metafield. */
export interface SwatchValueConfig {
  value: string; // option value label, e.g. "Royal Blue"
  type: SwatchDisplayType;
  hex?: string;
  hex2?: string;
  imageUrl?: string;
}

/**
 * Compiled per-product config — the exact JSON written to the product metafield
 * and read by the storefront (extensions/.../assets/swatchbox.js).
 */
export interface CompiledProductConfig {
  version: 1;
  swatchOption: string; // which option name is rendered as swatches
  displayType: SwatchDisplayType;
  values: SwatchValueConfig[];
  sizeChartUrl?: string | null;
}

/** Input accepted by the admin editor when saving a product's swatches. */
export interface SaveProductConfigInput {
  swatchOption: string;
  displayType: SwatchDisplayType;
  values: SwatchValueConfig[];
  sizeChartUrl?: string | null;
}

/** Lazily create (and return) the per-shop settings row. */
export async function getOrCreateShopSettings(
  shop: string,
): Promise<ShopSettings> {
  const existing = await prisma.shopSettings.findUnique({ where: { shop } });
  if (existing) return existing;
  return prisma.shopSettings.create({ data: { shop } });
}

/** Read a single product's stored config row (null if never configured). */
export async function getProductConfig(
  shop: string,
  productId: string,
): Promise<ProductConfig | null> {
  return prisma.productConfig.findUnique({
    where: { shop_productId: { shop, productId } },
  });
}

/** Parse the stored JSON back into a typed config (null on absence/parse error). */
export function parseConfig(
  row: ProductConfig | null,
): CompiledProductConfig | null {
  if (!row?.configJson) return null;
  try {
    return JSON.parse(row.configJson) as CompiledProductConfig;
  } catch {
    return null;
  }
}

function compile(input: SaveProductConfigInput): CompiledProductConfig {
  return {
    version: 1,
    swatchOption: input.swatchOption,
    displayType: input.displayType,
    values: input.values,
    sizeChartUrl: input.sizeChartUrl ?? null,
  };
}

export interface SaveResult {
  ok: boolean;
  syncStatus: "SYNCED" | "ERROR";
  error?: string;
}

/**
 * Source-of-truth write: upsert the config into Postgres, then compile and
 * publish it to the product's app-owned metafield so the storefront can read it
 * from Liquid with no network call. Records the sync status either way.
 */
export async function saveProductConfig(
  admin: Admin,
  shop: string,
  productId: string,
  input: SaveProductConfigInput,
): Promise<SaveResult> {
  const compiled = compile(input);
  const configJson = JSON.stringify(compiled);

  // 1. Persist to Postgres (source of truth) as PENDING.
  await prisma.productConfig.upsert({
    where: { shop_productId: { shop, productId } },
    create: {
      shop,
      productId,
      configJson,
      sizeChartUrl: input.sizeChartUrl ?? null,
      metafieldSyncStatus: "PENDING",
    },
    update: {
      configJson,
      sizeChartUrl: input.sizeChartUrl ?? null,
      metafieldSyncStatus: "PENDING",
      syncError: null,
    },
  });

  // 2. Publish to the product metafield.
  const result = await setJsonMetafield(
    admin,
    productId,
    METAFIELD_KEYS.productConfig,
    compiled,
  );

  // 3. Record the outcome.
  const syncStatus = result.ok ? "SYNCED" : "ERROR";
  await prisma.productConfig.update({
    where: { shop_productId: { shop, productId } },
    data: {
      metafieldSyncStatus: syncStatus,
      syncError: result.ok ? null : result.error,
      publishedAt: result.ok ? new Date() : undefined,
    },
  });

  return { ok: result.ok, syncStatus, error: result.error };
}

/** Persist the merchant's confirmation that the theme app embed is enabled. */
export async function setAppEmbedEnabled(
  shop: string,
  enabled: boolean,
): Promise<void> {
  await prisma.shopSettings.update({
    where: { shop },
    data: { appEmbedEnabledCache: enabled },
  });
}

export interface RepublishResult {
  products: number;
  ok: number;
  failed: number;
}

/**
 * Re-publish every stored setting to Shopify metafields: shop global + color
 * library, then each product's config. Useful as a maintenance/repair action if
 * metafields ever drift from the database.
 */
export async function republishAll(
  admin: Admin,
  shop: string,
): Promise<RepublishResult> {
  await publishShopConfig(admin, shop);

  const configs = await prisma.productConfig.findMany({ where: { shop } });
  let ok = 0;
  let failed = 0;
  for (const c of configs) {
    try {
      const compiled = JSON.parse(c.configJson);
      const r = await setJsonMetafield(
        admin,
        c.productId,
        METAFIELD_KEYS.productConfig,
        compiled,
      );
      if (r.ok) {
        ok++;
        await prisma.productConfig.update({
          where: { id: c.id },
          data: {
            metafieldSyncStatus: "SYNCED",
            syncError: null,
            publishedAt: new Date(),
          },
        });
      } else {
        failed++;
        await prisma.productConfig.update({
          where: { id: c.id },
          data: { metafieldSyncStatus: "ERROR", syncError: r.error },
        });
      }
    } catch (e) {
      failed++;
    }
  }
  return { products: configs.length, ok, failed };
}

/**
 * One-time per-shop setup: ensure settings row exists and metafield definitions
 * are created. Safe to call on every admin load (cheap + idempotent).
 */
export async function ensureShopSetup(
  admin: Admin,
  shop: string,
): Promise<ShopSettings> {
  const settings = await getOrCreateShopSettings(shop);
  if (!settings.metafieldDefsCreated) {
    await ensureMetafieldDefinitions(admin);
    await seedDefaultOptionTypes(shop);
    // Publish initial global + (empty) color library so the storefront can
    // render color swatches from defaults without per-product setup.
    await publishShopConfig(admin, shop);
    return prisma.shopSettings.update({
      where: { shop },
      data: { metafieldDefsCreated: true },
    });
  }
  return settings;
}
