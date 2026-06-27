import { useEffect, useMemo, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { useFetcher, useLoaderData } from "@remix-run/react";
import {
  Page,
  Card,
  BlockStack,
  InlineStack,
  Text,
  TextField,
  Select,
  Banner,
  Box,
  Divider,
  Thumbnail,
} from "@shopify/polaris";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import {
  getProductConfig,
  parseConfig,
  saveProductConfig,
  type SwatchValueConfig,
} from "../models/swatch.server";
import { guessHex, isHex } from "../lib/colorNames";

const toGid = (id: string) => `gid://shopify/Product/${id}`;

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const productGid = toGid(params.id!);

  const res = await admin.graphql(
    `#graphql
      query SwatchboxProductEditor($id: ID!) {
        product(id: $id) {
          id
          title
          featuredImage { url }
          options { id name position optionValues { id name } }
        }
      }`,
    { variables: { id: productGid } },
  );
  const body = await res.json();
  const product = body.data?.product;
  if (!product) {
    throw new Response("Product not found", { status: 404 });
  }

  const existing = parseConfig(await getProductConfig(session.shop, productGid));
  return { product, existing };
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const productGid = toGid(params.id!);
  const form = await request.formData();
  const payload = JSON.parse(String(form.get("payload"))) as {
    swatchOption: string;
    values: SwatchValueConfig[];
  };

  const result = await saveProductConfig(admin, session.shop, productGid, {
    swatchOption: payload.swatchOption,
    displayType: "color",
    values: payload.values,
  });

  return result;
};

/** Expand #abc -> #aabbcc so the native color input accepts it. */
function toSixHex(hex: string): string {
  const h = hex.trim();
  if (/^#[0-9a-fA-F]{3}$/.test(h)) {
    return "#" + h[1] + h[1] + h[2] + h[2] + h[3] + h[3];
  }
  if (/^#[0-9a-fA-F]{6}$/.test(h)) return h;
  return "#cccccc";
}

function ColorRow({
  label,
  hex,
  onChange,
}: {
  label: string;
  hex: string;
  onChange: (hex: string) => void;
}) {
  const valid = isHex(hex);
  return (
    <InlineStack gap="400" blockAlign="center" wrap={false}>
      <label
        style={{
          cursor: "pointer",
          position: "relative",
          display: "inline-block",
          flex: "0 0 auto",
        }}
      >
        <span
          style={{
            display: "block",
            width: 40,
            height: 40,
            borderRadius: "50%",
            background: valid ? hex : "#ffffff",
            border: "1px solid #c9cccf",
            boxShadow: "inset 0 0 0 2px #fff",
          }}
        />
        <input
          type="color"
          value={toSixHex(hex)}
          onChange={(e) => onChange(e.target.value)}
          style={{
            position: "absolute",
            inset: 0,
            opacity: 0,
            width: "100%",
            height: "100%",
            cursor: "pointer",
          }}
        />
      </label>
      <Box minWidth="160px">
        <Text as="span" variant="bodyMd" fontWeight="medium">
          {label}
        </Text>
      </Box>
      <Box minWidth="140px">
        <TextField
          label={`${label} hex`}
          labelHidden
          value={hex}
          autoComplete="off"
          onChange={onChange}
          error={valid ? undefined : "Enter a hex like #4169e1"}
          prefix=""
        />
      </Box>
    </InlineStack>
  );
}

export default function ProductEditor() {
  const { product, existing } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();

  const options: { name: string; values: string[] }[] = product.options.map(
    (o: { name: string; optionValues: { name: string }[] }) => ({
      name: o.name,
      values: o.optionValues.map((v) => v.name),
    }),
  );

  // Default swatch option: existing config -> an option literally named like a
  // color -> the first option.
  const defaultOption =
    existing?.swatchOption ??
    options.find((o) => /colou?r/i.test(o.name))?.name ??
    options[0]?.name ??
    "";

  const [optionName, setOptionName] = useState(defaultOption);

  const currentValues = useMemo(
    () => options.find((o) => o.name === optionName)?.values ?? [],
    [options, optionName],
  );

  // hex per value, seeded from existing config then guessed.
  const [hexByValue, setHexByValue] = useState<Record<string, string>>(() => {
    const seed: Record<string, string> = {};
    for (const v of existing?.values ?? []) {
      if (v.hex) seed[v.value] = v.hex;
    }
    return seed;
  });

  // Ensure every current value has a hex (guess if missing).
  useEffect(() => {
    setHexByValue((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const v of currentValues) {
        if (!next[v]) {
          next[v] = guessHex(v);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [currentValues]);

  const isSaving =
    fetcher.state !== "idle" && fetcher.formMethod === "POST";

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data) {
      if (fetcher.data.ok) {
        shopify.toast.show("Swatches saved and published");
      } else {
        shopify.toast.show("Saved locally, but publishing failed", {
          isError: true,
        });
      }
    }
  }, [fetcher.state, fetcher.data, shopify]);

  const save = () => {
    const values: SwatchValueConfig[] = currentValues.map((v) => ({
      value: v,
      type: "color",
      hex: hexByValue[v],
    }));
    fetcher.submit(
      { payload: JSON.stringify({ swatchOption: optionName, values }) },
      { method: "POST" },
    );
  };

  const allValid = currentValues.every((v) => isHex(hexByValue[v] ?? ""));

  return (
    <Page
      backAction={{ content: "Products", url: "/app/products" }}
      title={product.title}
      titleMetadata={
        existing ? <Text as="span" tone="subdued" variant="bodySm">Configured</Text> : undefined
      }
    >
      <TitleBar title={product.title}>
        <button
          variant="primary"
          onClick={save}
          disabled={!optionName || currentValues.length === 0 || !allValid}
        >
          {isSaving ? "Saving…" : "Save"}
        </button>
      </TitleBar>

      <BlockStack gap="500">
        {fetcher.data && !fetcher.data.ok && (
          <Banner
            tone="warning"
            title="Saved to your database, but couldn't publish to the storefront"
          >
            <p>{fetcher.data.error ?? "Unknown error while writing the metafield."}</p>
          </Banner>
        )}

        <Card>
          <BlockStack gap="400">
            <InlineStack gap="300" blockAlign="center">
              <Thumbnail
                source={product.featuredImage?.url ?? ""}
                alt={product.title}
                size="small"
              />
              <BlockStack gap="050">
                <Text as="h2" variant="headingMd">
                  Color swatches
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  Choose which option becomes swatches, then set a color for each value.
                </Text>
              </BlockStack>
            </InlineStack>

            <Select
              label="Swatch option"
              options={options.map((o) => ({ label: o.name, value: o.name }))}
              value={optionName}
              onChange={setOptionName}
              helpText="The product option whose values will render as clickable color swatches."
            />
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="400">
            <Text as="h3" variant="headingSm">
              {optionName || "Option"} colors
            </Text>

            {currentValues.length === 0 ? (
              <Text as="p" tone="subdued">
                This option has no values.
              </Text>
            ) : (
              <BlockStack gap="300">
                {/* live preview strip */}
                <InlineStack gap="200" blockAlign="center">
                  {currentValues.map((v) => (
                    <span
                      key={v}
                      title={v}
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: "50%",
                        background: isHex(hexByValue[v] ?? "")
                          ? hexByValue[v]
                          : "#fff",
                        border: "1px solid #c9cccf",
                      }}
                    />
                  ))}
                </InlineStack>

                <Divider />

                {currentValues.map((v) => (
                  <ColorRow
                    key={v}
                    label={v}
                    hex={hexByValue[v] ?? ""}
                    onChange={(hex) =>
                      setHexByValue((prev) => ({ ...prev, [v]: hex }))
                    }
                  />
                ))}
              </BlockStack>
            )}
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
