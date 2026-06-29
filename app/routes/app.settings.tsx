import { useEffect, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { useFetcher, useLoaderData } from "@remix-run/react";
import {
  Page,
  Card,
  BlockStack,
  InlineStack,
  Text,
  Button,
  Badge,
  Checkbox,
  Divider,
  Banner,
} from "@shopify/polaris";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import {
  getOrCreateShopSettings,
  setAppEmbedEnabled,
  republishAll,
} from "../models/swatch.server";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const [settings, productCount, libraryCount] = await Promise.all([
    getOrCreateShopSettings(shop),
    prisma.productConfig.count({ where: { shop } }),
    prisma.colorLibraryEntry.count({ where: { shop } }),
  ]);
  return {
    shop,
    embedEnabled: settings.appEmbedEnabledCache,
    productCount,
    libraryCount,
    themeEditorUrl: `https://${shop}/admin/themes/current/editor?context=apps`,
    storefrontUrl: `https://${shop}`,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  const form = await request.formData();
  const intent = String(form.get("intent"));

  if (intent === "embed") {
    await setAppEmbedEnabled(shop, form.get("enabled") === "true");
    return { ok: true, intent, products: 0, okCount: 0, failed: 0 };
  }
  if (intent === "republish") {
    const r = await republishAll(admin, shop);
    return {
      ok: true,
      intent,
      products: r.products,
      okCount: r.ok,
      failed: r.failed,
    };
  }
  return { ok: false, intent: "unknown", products: 0, okCount: 0, failed: 0 };
};

export default function Settings() {
  const data = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();
  const [embed, setEmbed] = useState(data.embedEnabled);

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.ok) {
      if (fetcher.data.intent === "republish") {
        shopify.toast.show(
          `Re-published ${fetcher.data.okCount}/${fetcher.data.products} products`,
        );
      } else if (fetcher.data.intent === "embed") {
        shopify.toast.show("Saved");
      }
    }
  }, [fetcher.state, fetcher.data, shopify]);

  const toggleEmbed = (value: boolean) => {
    setEmbed(value);
    fetcher.submit(
      { intent: "embed", enabled: String(value) },
      { method: "POST" },
    );
  };
  const republish = () =>
    fetcher.submit({ intent: "republish" }, { method: "POST" });

  const busy = fetcher.state !== "idle";

  return (
    <Page>
      <TitleBar title="Settings" />
      <BlockStack gap="500">
        <Card>
          <BlockStack gap="400">
            <InlineStack align="space-between" blockAlign="center">
              <Text as="h2" variant="headingMd">
                Theme app embed
              </Text>
              <Badge tone={embed ? "success" : "attention"}>
                {embed ? "Enabled" : "Not enabled"}
              </Badge>
            </InlineStack>
            <Text as="p" tone="subdued" variant="bodySm">
              Swatches only appear on your storefront once the Swatchbox app embed is
              turned on in your theme. Enable it in the theme editor, then confirm below.
            </Text>
            <InlineStack gap="300">
              <Button url={data.themeEditorUrl} target="_blank" variant="primary">
                Open theme editor
              </Button>
              <Button url={data.storefrontUrl} target="_blank">
                View storefront
              </Button>
            </InlineStack>
            <Divider />
            <Checkbox
              label="The Swatchbox app embed is enabled in my theme"
              checked={embed}
              onChange={toggleEmbed}
            />
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">
              Maintenance
            </Text>
            <Text as="p" tone="subdued" variant="bodySm">
              Re-publishes every saved setting (global defaults, color library, and all
              product configs) to your store's metafields. Use this if swatches look out
              of date on the storefront.
            </Text>
            {fetcher.data?.ok && fetcher.data.intent === "republish" && (
              <Banner tone={fetcher.data.failed ? "warning" : "success"}>
                <p>
                  Re-published {fetcher.data.okCount} of {fetcher.data.products} products
                  {fetcher.data.failed ? `, ${fetcher.data.failed} failed` : ""}.
                </p>
              </Banner>
            )}
            <InlineStack>
              <Button onClick={republish} loading={busy}>
                Re-publish all settings
              </Button>
            </InlineStack>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">
              Summary
            </Text>
            <InlineStack align="space-between">
              <Text as="span" variant="bodyMd">
                Products configured
              </Text>
              <Text as="span" variant="bodyMd" fontWeight="semibold">
                {data.productCount}
              </Text>
            </InlineStack>
            <InlineStack align="space-between">
              <Text as="span" variant="bodyMd">
                Colors in library
              </Text>
              <Text as="span" variant="bodyMd" fontWeight="semibold">
                {data.libraryCount}
              </Text>
            </InlineStack>
            <Text as="p" tone="subdued" variant="bodySm">
              Store: {data.shop}
            </Text>
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
