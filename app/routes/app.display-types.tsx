import { useEffect, useState } from "react";
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
  Button,
  RangeSlider,
  Box,
  Divider,
  Checkbox,
  Badge,
} from "@shopify/polaris";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import {
  getOptionTypeMappings,
  setOptionTypeMappings,
  updateSwatchStyle,
  updateMetadataSettings,
  publishGlobal,
} from "../models/library.server";
import { getOrCreateShopSettings } from "../models/swatch.server";
import { getPlanStatus } from "../models/billing.server";
import { isFreeDisplayType } from "../lib/plans";

const DISPLAY_OPTIONS_ALL = [
  { label: "Color swatches", value: "color" },
  { label: "Variant image", value: "variant_image" },
  { label: "Image swatches (Pro)", value: "image" },
  { label: "Buttons (Pro)", value: "button" },
  { label: "Dropdown (Pro)", value: "dropdown" },
];
const DISPLAY_OPTIONS_FREE = DISPLAY_OPTIONS_ALL.filter((o) =>
  isFreeDisplayType(o.value),
);

const SHAPE_OPTIONS = [
  { label: "Circle", value: "circle" },
  { label: "Square", value: "square" },
  { label: "Rounded square", value: "rounded" },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, billing } = await authenticate.admin(request);
  const shop = session.shop;
  const [mappings, settings, plan] = await Promise.all([
    getOptionTypeMappings(shop),
    getOrCreateShopSettings(shop),
    getPlanStatus(billing),
  ]);
  return {
    isPro: plan.isPro,
    mappings: mappings.map((m) => ({
      optionName: m.optionName,
      displayType: m.displayType as string,
    })),
    shape: settings.swatchShape,
    size: settings.swatchSize,
    showPrice: settings.showPrice,
    showLabels: settings.showLabels,
    showBadges: settings.showBadges,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session, billing } = await authenticate.admin(request);
  const shop = session.shop;
  const { isPro } = await getPlanStatus(billing);
  const form = await request.formData();
  const payload = JSON.parse(String(form.get("payload"))) as {
    mappings: { optionName: string; displayType: string }[];
    shape: string;
    size: number;
    showPrice: boolean;
    showLabels: boolean;
    showBadges: boolean;
  };

  // On Free, drop Pro display types and force metadata toggles off.
  const mappings = payload.mappings.filter(
    (m) => isPro || isFreeDisplayType(m.displayType),
  );

  await setOptionTypeMappings(
    shop,
    mappings.map((m) => ({
      optionName: m.optionName,
      displayType: m.displayType as never,
    })),
  );
  await updateSwatchStyle(shop, { shape: payload.shape, size: payload.size });
  await updateMetadataSettings(shop, {
    showPrice: isPro ? payload.showPrice : false,
    showLabels: isPro ? payload.showLabels : false,
    showBadges: isPro ? payload.showBadges : false,
  });
  await publishGlobal(admin, shop);
  return { ok: true };
};

type Mapping = { optionName: string; displayType: string };

export default function DisplayTypes() {
  const data = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();

  const [mappings, setMappings] = useState<Mapping[]>(data.mappings);
  const [shape, setShape] = useState(data.shape);
  const [size, setSize] = useState<number>(data.size);
  const [showPrice, setShowPrice] = useState(data.showPrice);
  const [showLabels, setShowLabels] = useState(data.showLabels);
  const [showBadges, setShowBadges] = useState(data.showBadges);

  const displayOptions = data.isPro
    ? DISPLAY_OPTIONS_ALL
    : DISPLAY_OPTIONS_FREE;

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.ok) {
      shopify.toast.show("Display settings saved");
    }
  }, [fetcher.state, fetcher.data, shopify]);

  const updateMapping = (i: number, patch: Partial<Mapping>) =>
    setMappings((prev) => prev.map((m, idx) => (idx === i ? { ...m, ...patch } : m)));
  const addMapping = () =>
    setMappings((prev) => [...prev, { optionName: "", displayType: "color" }]);
  const removeMapping = (i: number) =>
    setMappings((prev) => prev.filter((_, idx) => idx !== i));

  const save = () => {
    fetcher.submit(
      {
        payload: JSON.stringify({
          mappings,
          shape,
          size,
          showPrice,
          showLabels,
          showBadges,
        }),
      },
      { method: "POST" },
    );
  };

  const saving = fetcher.state !== "idle";

  const radius =
    shape === "square" ? 0 : shape === "rounded" ? Math.round(size * 0.22) : size / 2;

  return (
    <Page>
      <TitleBar title="Display types">
        <button variant="primary" onClick={save}>
          {saving ? "Saving…" : "Save"}
        </button>
      </TitleBar>

      <BlockStack gap="500">
        <Card>
          <BlockStack gap="400">
            <BlockStack gap="100">
              <Text as="h2" variant="headingMd">
                Option display types
              </Text>
              <Text as="p" tone="subdued" variant="bodySm">
                Set how each option renders by default across all products. Per-product
                settings override these.
              </Text>
            </BlockStack>

            {mappings.length === 0 ? (
              <Text as="p" tone="subdued">
                No defaults yet. Add one — e.g. “Size” → Buttons.
              </Text>
            ) : (
              <BlockStack gap="300">
                {mappings.map((m, i) => (
                  <InlineStack key={i} gap="300" blockAlign="end" wrap={false}>
                    <Box minWidth="240px">
                      <TextField
                        label="Option name"
                        labelHidden={i > 0}
                        value={m.optionName}
                        onChange={(v) => updateMapping(i, { optionName: v })}
                        autoComplete="off"
                        placeholder="e.g. Color, Size"
                      />
                    </Box>
                    <Box minWidth="200px">
                      <Select
                        label="Display type"
                        labelHidden={i > 0}
                        options={displayOptions}
                        value={m.displayType}
                        onChange={(v) => updateMapping(i, { displayType: v })}
                      />
                    </Box>
                    <Button
                      variant="plain"
                      tone="critical"
                      onClick={() => removeMapping(i)}
                    >
                      Remove
                    </Button>
                  </InlineStack>
                ))}
              </BlockStack>
            )}

            <InlineStack>
              <Button onClick={addMapping}>Add option</Button>
            </InlineStack>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">
              Swatch style
            </Text>
            <InlineStack gap="500" blockAlign="center">
              <span
                style={{
                  width: size,
                  height: size,
                  borderRadius: radius,
                  background: "#4169e1",
                  border: "1px solid #c9cccf",
                  flex: "0 0 auto",
                }}
              />
              <Box minWidth="240px">
                <Select
                  label="Shape"
                  options={SHAPE_OPTIONS}
                  value={shape}
                  onChange={setShape}
                />
              </Box>
              <Box minWidth="260px">
                <RangeSlider
                  label={`Size: ${size}px`}
                  min={24}
                  max={56}
                  step={2}
                  value={size}
                  onChange={(v) => setSize(Array.isArray(v) ? v[0] : v)}
                />
              </Box>
            </InlineStack>
            <Divider />
            <Text as="p" tone="subdued" variant="bodySm">
              Shape and size apply to color and image swatches on your storefront.
            </Text>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="400">
            <InlineStack align="space-between" blockAlign="center">
              <Text as="h2" variant="headingMd">
                Labels, price &amp; badges
              </Text>
              {!data.isPro && <Badge tone="info">Pro</Badge>}
            </InlineStack>
            <Text as="p" tone="subdued" variant="bodySm">
              Extra details shown alongside each swatch on your storefront.
            </Text>
            {data.isPro ? (
              <BlockStack gap="300">
                <Checkbox
                  label="Show the value name under each swatch"
                  checked={showLabels}
                  onChange={setShowLabels}
                />
                <Checkbox
                  label="Show each option's price"
                  checked={showPrice}
                  onChange={setShowPrice}
                />
                <Checkbox
                  label="Show a Sale badge on discounted options"
                  checked={showBadges}
                  onChange={setShowBadges}
                />
              </BlockStack>
            ) : (
              <Button url="/app/billing">Upgrade to Pro to enable</Button>
            )}
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
