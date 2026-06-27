import type { AdminApiContext } from "@shopify/shopify-app-remix/server";

/**
 * App-owned (reserved) metafield namespace. Set via the Admin API with the
 * `$app:` prefix; Shopify stores it under the app's reserved namespace and our
 * own theme app extension reads it in Liquid via bracket notation, e.g.
 *   product.metafields["$app:swatchbox"].config.value
 *   shop.metafields["$app:swatchbox"].global.value
 * Other apps cannot collide with this namespace.
 */
export const SWATCHBOX_NAMESPACE = "$app:swatchbox";

export const METAFIELD_KEYS = {
  /** Product-owned: per-product swatch config. */
  productConfig: "config",
  /** Shop-owned: global defaults / inventory rules / styling tokens. */
  shopGlobal: "global",
  /** Shop-owned: canonical color library (name -> hex/image). */
  shopColorLibrary: "color_library",
} as const;

type Admin = { graphql: AdminApiContext["graphql"] };

const METAFIELDS_SET_MUTATION = `#graphql
  mutation SwatchboxMetafieldsSet($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields { id namespace key ownerType }
      userErrors { field message code }
    }
  }`;

const SHOP_ID_QUERY = `#graphql
  query SwatchboxShopId { shop { id } }`;

export interface MetafieldSetResult {
  ok: boolean;
  error?: string;
}

/** Write a single JSON metafield onto any owner resource. */
export async function setJsonMetafield(
  admin: Admin,
  ownerId: string,
  key: string,
  value: unknown,
): Promise<MetafieldSetResult> {
  const response = await admin.graphql(METAFIELDS_SET_MUTATION, {
    variables: {
      metafields: [
        {
          ownerId,
          namespace: SWATCHBOX_NAMESPACE,
          key,
          type: "json",
          value: JSON.stringify(value),
        },
      ],
    },
  });
  const body = await response.json();
  const userErrors = body?.data?.metafieldsSet?.userErrors ?? [];
  if (userErrors.length > 0) {
    return {
      ok: false,
      error: userErrors
        .map((e: { field?: string[]; message: string }) => e.message)
        .join("; "),
    };
  }
  return { ok: true };
}

/** Resolve the Shop GID (owner id for shop-level metafields). */
export async function getShopGid(admin: Admin): Promise<string> {
  const response = await admin.graphql(SHOP_ID_QUERY);
  const body = await response.json();
  return body.data.shop.id as string;
}

/** Write a shop-level JSON metafield by key. */
export async function setShopMetafield(
  admin: Admin,
  key: string,
  value: unknown,
): Promise<MetafieldSetResult> {
  const shopId = await getShopGid(admin);
  return setJsonMetafield(admin, shopId, key, value);
}

const DEFINITION_CREATE_MUTATION = `#graphql
  mutation SwatchboxDefinitionCreate($definition: MetafieldDefinitionInput!) {
    metafieldDefinitionCreate(definition: $definition) {
      createdDefinition { id }
      userErrors { field message code }
    }
  }`;

interface DefinitionSpec {
  name: string;
  key: string;
  ownerType: "PRODUCT" | "SHOP";
}

const DEFINITIONS: DefinitionSpec[] = [
  { name: "Swatchbox config", key: METAFIELD_KEYS.productConfig, ownerType: "PRODUCT" },
  { name: "Swatchbox global", key: METAFIELD_KEYS.shopGlobal, ownerType: "SHOP" },
  { name: "Swatchbox color library", key: METAFIELD_KEYS.shopColorLibrary, ownerType: "SHOP" },
];

/**
 * Create the app-owned metafield definitions (typed + pinned) once per shop.
 * Idempotent: a "definition already exists" / TAKEN error is treated as success.
 * Definitions are not strictly required to read/write app-owned metafields, so
 * any failure here is non-fatal for the caller.
 */
export async function ensureMetafieldDefinitions(admin: Admin): Promise<void> {
  for (const def of DEFINITIONS) {
    try {
      await admin.graphql(DEFINITION_CREATE_MUTATION, {
        variables: {
          definition: {
            name: def.name,
            namespace: SWATCHBOX_NAMESPACE,
            key: def.key,
            type: "json",
            ownerType: def.ownerType,
          },
        },
      });
    } catch {
      // Non-fatal — reads/writes work without definitions.
    }
  }
}
