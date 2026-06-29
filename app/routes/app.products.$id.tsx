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
  Button,
  Spinner,
} from "@shopify/polaris";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import {
  getProductConfig,
  parseConfig,
  saveProductConfig,
  type SwatchDisplayType,
  type SwatchValueConfig,
} from "../models/swatch.server";
import { guessHex, isHex } from "../lib/colorNames";
import { getPlanStatus } from "../models/billing.server";
import { isFreeDisplayType } from "../lib/plans";

const toGid = (id: string) => `gid://shopify/Product/${id}`;

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { admin, session, billing } = await authenticate.admin(request);
  const productGid = toGid(params.id!);
  const { isPro } = await getPlanStatus(billing);

  const res = await admin.graphql(
    `#graphql
      query SwatchboxProductEditor($id: ID!) {
        product(id: $id) {
          id
          title
          featuredImage { url }
          options { id name position optionValues { id name } }
          variants(first: 100) {
            nodes { id title image { url } selectedOptions { name value } }
          }
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
  return { product, existing, isPro };
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { admin, session, billing } = await authenticate.admin(request);
  const productGid = toGid(params.id!);
  const { isPro } = await getPlanStatus(billing);
  const form = await request.formData();
  const payload = JSON.parse(String(form.get("payload"))) as {
    swatchOption: string;
    displayType: SwatchDisplayType;
    values: SwatchValueConfig[];
    sizeChartUrl?: string | null;
  };

  // Free plan can only use color / variant-image and no size chart.
  if (!isPro && !isFreeDisplayType(payload.displayType)) {
    return {
      ok: false,
      syncStatus: "ERROR" as const,
      error: "This display type requires the Pro plan.",
    };
  }

  const result = await saveProductConfig(admin, session.shop, productGid, {
    swatchOption: payload.swatchOption,
    displayType: payload.displayType,
    values: payload.values,
    sizeChartUrl: isPro ? payload.sizeChartUrl?.trim() || null : null,
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
      <label style={{ cursor: "pointer", position: "relative", flex: "0 0 auto" }}>
        <span
          style={{
            display: "block",
            width: 40,
            height: 40,
            borderRadius: "50%",
            background: valid ? hex : "#ffffff",
            border: "1px solid #c9cccf",
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
        />
      </Box>
    </InlineStack>
  );
}

function ImageRow({
  label,
  imageUrl,
  onChange,
  onUpload,
}: {
  label: string;
  imageUrl: string;
  onChange: (url: string) => void;
  onUpload: (file: File) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const inputId = `sb-file-${label.replace(/\W+/g, "-")}`;

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      await onUpload(file);
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  };

  return (
    <InlineStack gap="400" blockAlign="center" wrap={false}>
      <span
        style={{
          display: "block",
          width: 40,
          height: 40,
          borderRadius: 8,
          flex: "0 0 auto",
          border: "1px solid #c9cccf",
          background: imageUrl
            ? `center/cover no-repeat url(${imageUrl})`
            : "#f6f6f7",
        }}
      />
      <Box minWidth="140px">
        <Text as="span" variant="bodyMd" fontWeight="medium">
          {label}
        </Text>
      </Box>
      <InlineStack gap="200" blockAlign="center">
        <input
          id={inputId}
          type="file"
          accept="image/*"
          onChange={handleFile}
          style={{ display: "none" }}
        />
        <Button
          size="slim"
          onClick={() => document.getElementById(inputId)?.click()}
          disabled={busy}
        >
          {busy ? "Uploading…" : imageUrl ? "Replace" : "Upload"}
        </Button>
        {busy && <Spinner size="small" />}
      </InlineStack>
      <Box minWidth="200px">
        <TextField
          label={`${label} image URL`}
          labelHidden
          value={imageUrl}
          autoComplete="off"
          placeholder="or paste an image URL"
          onChange={onChange}
        />
      </Box>
    </InlineStack>
  );
}

const DISPLAY_OPTIONS: { label: string; value: SwatchDisplayType }[] = [
  { label: "Color swatches", value: "color" },
  { label: "Variant image", value: "variant_image" },
  { label: "Image swatches (Pro)", value: "image" },
  { label: "Buttons (Pro)", value: "button" },
  { label: "Dropdown (Pro)", value: "dropdown" },
];

export default function ProductEditor() {
  const { product, existing, isPro } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();

  const displayOptions = isPro
    ? DISPLAY_OPTIONS
    : DISPLAY_OPTIONS.filter((o) => isFreeDisplayType(o.value));

  const options: { name: string; values: string[] }[] = product.options.map(
    (o: { name: string; optionValues: { name: string }[] }) => ({
      name: o.name,
      values: o.optionValues.map((v) => v.name),
    }),
  );

  const defaultOption =
    existing?.swatchOption ??
    options.find((o) => /colou?r/i.test(o.name))?.name ??
    options[0]?.name ??
    "";

  const [optionName, setOptionName] = useState(defaultOption);
  const [displayType, setDisplayType] = useState<SwatchDisplayType>(
    (existing?.displayType as SwatchDisplayType) ?? "color",
  );
  const [sizeChartUrl, setSizeChartUrl] = useState(existing?.sizeChartUrl ?? "");

  const currentValues = useMemo(
    () => options.find((o) => o.name === optionName)?.values ?? [],
    [options, optionName],
  );

  // Map each option value -> the featured image of a variant with that value.
  const variantImageByValue = useMemo(() => {
    const map: Record<string, string> = {};
    for (const v of product.variants.nodes as {
      image: { url: string } | null;
      selectedOptions: { name: string; value: string }[];
    }[]) {
      const so = v.selectedOptions.find((s) => s.name === optionName);
      if (so && v.image?.url && !map[so.value]) map[so.value] = v.image.url;
    }
    return map;
  }, [product.variants.nodes, optionName]);

  const [hexByValue, setHexByValue] = useState<Record<string, string>>(() => {
    const seed: Record<string, string> = {};
    for (const v of existing?.values ?? []) if (v.hex) seed[v.value] = v.hex;
    return seed;
  });
  const [imageByValue, setImageByValue] = useState<Record<string, string>>(() => {
    const seed: Record<string, string> = {};
    for (const v of existing?.values ?? [])
      if (v.imageUrl) seed[v.value] = v.imageUrl;
    return seed;
  });

  useEffect(() => {
    setHexByValue((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const v of currentValues)
        if (!next[v]) {
          next[v] = guessHex(v);
          changed = true;
        }
      return changed ? next : prev;
    });
  }, [currentValues]);

  const isSaving = fetcher.state !== "idle" && fetcher.formMethod === "POST";

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data) {
      shopify.toast.show(
        fetcher.data.ok
          ? "Swatches saved and published"
          : "Saved locally, but publishing failed",
        { isError: !fetcher.data.ok },
      );
    }
  }, [fetcher.state, fetcher.data, shopify]);

  const uploadImage = async (value: string, file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/upload", { method: "POST", body: fd });
    const data = await res.json();
    if (data.ok && data.url) {
      setImageByValue((prev) => ({ ...prev, [value]: data.url }));
    } else {
      shopify.toast.show(data.error || "Upload failed", { isError: true });
    }
  };

  const save = () => {
    const values: SwatchValueConfig[] = currentValues.map((v) => {
      if (displayType === "color") {
        return { value: v, type: "color", hex: hexByValue[v] };
      }
      if (displayType === "image") {
        return { value: v, type: "image", imageUrl: imageByValue[v] };
      }
      // variant_image, button, dropdown — no per-value data needed; the
      // storefront resolves variant images / renders from the option values.
      return { value: v, type: displayType };
    });
    fetcher.submit(
      {
        payload: JSON.stringify({
          swatchOption: optionName,
          displayType,
          values,
          sizeChartUrl,
        }),
      },
      { method: "POST" },
    );
  };

  const colorsValid =
    displayType !== "color" ||
    currentValues.every((v) => isHex(hexByValue[v] ?? ""));
  const imagesValid =
    displayType !== "image" ||
    currentValues.every((v) => (imageByValue[v] ?? "").trim() !== "");
  const canSave =
    !!optionName && currentValues.length > 0 && colorsValid && imagesValid;

  return (
    <Page
      backAction={{ content: "Products", url: "/app/products" }}
      title={product.title}
    >
      <TitleBar title={product.title}>
        <button variant="primary" onClick={save} disabled={!canSave}>
          {isSaving ? "Saving…" : "Save"}
        </button>
      </TitleBar>

      <BlockStack gap="500">
        {fetcher.data && !fetcher.data.ok && (
          <Banner tone="warning" title="Saved to your database, but couldn't publish to the storefront">
            <p>{fetcher.data.error ?? "Unknown error while writing the metafield."}</p>
          </Banner>
        )}

        <Card>
          <BlockStack gap="400">
            <InlineStack gap="300" blockAlign="center">
              <Thumbnail source={product.featuredImage?.url ?? ""} alt={product.title} size="small" />
              <BlockStack gap="050">
                <Text as="h2" variant="headingMd">
                  Swatch setup
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  Pick the option to turn into swatches and how it should look.
                </Text>
              </BlockStack>
            </InlineStack>

            <InlineStack gap="400">
              <Box minWidth="240px">
                <Select
                  label="Swatch option"
                  options={options.map((o) => ({ label: o.name, value: o.name }))}
                  value={optionName}
                  onChange={setOptionName}
                />
              </Box>
              <Box minWidth="240px">
                <Select
                  label="Display type"
                  options={displayOptions}
                  value={displayType}
                  onChange={(v) => setDisplayType(v as SwatchDisplayType)}
                />
              </Box>
            </InlineStack>

            {isPro && (
              <TextField
                label="Size chart URL (optional)"
                value={sizeChartUrl}
                onChange={setSizeChartUrl}
                autoComplete="off"
                placeholder="https://…"
                helpText="Shows a “Size chart” link next to the swatches that opens this page."
              />
            )}
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="400">
            <Text as="h3" variant="headingSm">
              {optionName || "Option"} values
            </Text>

            {currentValues.length === 0 ? (
              <Text as="p" tone="subdued">
                This option has no values.
              </Text>
            ) : displayType === "color" ? (
              <BlockStack gap="300">
                {currentValues.map((v) => (
                  <ColorRow
                    key={v}
                    label={v}
                    hex={hexByValue[v] ?? ""}
                    onChange={(hex) => setHexByValue((p) => ({ ...p, [v]: hex }))}
                  />
                ))}
              </BlockStack>
            ) : displayType === "image" ? (
              <BlockStack gap="300">
                {currentValues.map((v) => (
                  <ImageRow
                    key={v}
                    label={v}
                    imageUrl={imageByValue[v] ?? ""}
                    onChange={(url) => setImageByValue((p) => ({ ...p, [v]: url }))}
                    onUpload={(file) => uploadImage(v, file)}
                  />
                ))}
              </BlockStack>
            ) : displayType === "variant_image" ? (
              <BlockStack gap="300">
                <Text as="p" variant="bodySm" tone="subdued">
                  Each value uses its variant's product image automatically.
                </Text>
                {currentValues.map((v) => (
                  <InlineStack key={v} gap="400" blockAlign="center" wrap={false}>
                    <span
                      style={{
                        display: "block",
                        width: 40,
                        height: 40,
                        borderRadius: 8,
                        flex: "0 0 auto",
                        border: "1px solid #c9cccf",
                        background: variantImageByValue[v]
                          ? `center/cover no-repeat url(${variantImageByValue[v]})`
                          : "#f6f6f7",
                      }}
                    />
                    <Text as="span" variant="bodyMd" fontWeight="medium">
                      {v}
                    </Text>
                    {!variantImageByValue[v] && (
                      <Text as="span" variant="bodySm" tone="subdued">
                        No variant image
                      </Text>
                    )}
                  </InlineStack>
                ))}
              </BlockStack>
            ) : (
              // button | dropdown — render straight from the option values
              <BlockStack gap="300">
                <Text as="p" variant="bodySm" tone="subdued">
                  {displayType === "button"
                    ? "Each value renders as a selectable button. No extra setup needed."
                    : "Values render in an enhanced dropdown. No extra setup needed."}
                </Text>
                <InlineStack gap="200">
                  {currentValues.map((v) =>
                    displayType === "button" ? (
                      <span
                        key={v}
                        style={{
                          padding: "6px 14px",
                          border: "1px solid #8a8a8a",
                          borderRadius: 6,
                          fontSize: 14,
                        }}
                      >
                        {v}
                      </span>
                    ) : (
                      <Text key={v} as="span" variant="bodyMd">
                        {v}
                        {v !== currentValues[currentValues.length - 1] ? " · " : ""}
                      </Text>
                    ),
                  )}
                </InlineStack>
              </BlockStack>
            )}
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
