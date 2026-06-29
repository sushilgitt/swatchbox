import { useEffect, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { useFetcher, useLoaderData } from "@remix-run/react";
import {
  Page,
  Card,
  BlockStack,
  Text,
  Checkbox,
} from "@shopify/polaris";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import {
  updateCollectionSettings,
  publishGlobal,
} from "../models/library.server";
import { getOrCreateShopSettings } from "../models/swatch.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const s = await getOrCreateShopSettings(session.shop);
  return {
    collectionSwatchesEnabled: s.collectionSwatchesEnabled,
    splitByVariant: s.splitByVariant,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  const form = await request.formData();
  const payload = JSON.parse(String(form.get("payload"))) as {
    collectionSwatchesEnabled: boolean;
    splitByVariant: boolean;
  };
  await updateCollectionSettings(shop, payload);
  await publishGlobal(admin, shop);
  return { ok: true };
};

export default function Collections() {
  const data = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();

  const [enabled, setEnabled] = useState(data.collectionSwatchesEnabled);
  const [split, setSplit] = useState(data.splitByVariant);

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.ok) {
      shopify.toast.show("Collection settings saved");
    }
  }, [fetcher.state, fetcher.data, shopify]);

  const save = () => {
    fetcher.submit(
      {
        payload: JSON.stringify({
          collectionSwatchesEnabled: enabled,
          splitByVariant: split,
        }),
      },
      { method: "POST" },
    );
  };

  const saving = fetcher.state !== "idle";

  return (
    <Page>
      <TitleBar title="Collections">
        <button variant="primary" onClick={save}>
          {saving ? "Saving…" : "Save"}
        </button>
      </TitleBar>

      <BlockStack gap="500">
        <Card>
          <BlockStack gap="400">
            <BlockStack gap="100">
              <Text as="h2" variant="headingMd">
                Collection &amp; search swatches
              </Text>
              <Text as="p" tone="subdued" variant="bodySm">
                Show mini color/image swatches on product cards across collection and
                search pages. Shoppers can preview colors and jump straight to a variant.
              </Text>
            </BlockStack>
            <Checkbox
              label="Show swatches on product cards"
              checked={enabled}
              onChange={setEnabled}
            />
            <Checkbox
              label="Split products by variant (show each color as its own card)"
              checked={split}
              onChange={setSplit}
              disabled={!enabled}
              helpText="Each color value gets its own card with its image. Works best on Online Store 2.0 themes like Dawn."
            />
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
