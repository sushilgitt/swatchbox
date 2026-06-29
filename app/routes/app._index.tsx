import type { LoaderFunctionArgs } from "@remix-run/node";
import { Link as RemixLink, useLoaderData } from "@remix-run/react";
import {
  Page,
  Layout,
  Text,
  Card,
  Button,
  BlockStack,
  InlineStack,
  Badge,
  Icon,
  Box,
  Divider,
} from "@shopify/polaris";
import {
  CheckCircleIcon,
  ColorIcon,
  ThemeEditIcon,
  ViewIcon,
} from "@shopify/polaris-icons";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { ensureShopSetup } from "../models/swatch.server";
import { getPlanStatus } from "../models/billing.server";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session, billing } = await authenticate.admin(request);
  const shop = session.shop;

  // Lazily create settings + metafield definitions for this shop.
  const settings = await ensureShopSetup(admin, shop);

  const [configuredCount, libraryCount, plan] = await Promise.all([
    prisma.productConfig.count({ where: { shop } }),
    prisma.colorLibraryEntry.count({ where: { shop } }),
    getPlanStatus(billing),
  ]);

  const themeEditorUrl = `https://${shop}/admin/themes/current/editor?context=apps`;

  return {
    shop,
    configuredCount,
    libraryCount,
    embedEnabled: settings.appEmbedEnabledCache,
    isPro: plan.isPro,
    themeEditorUrl,
  };
};

function StepCard({
  done,
  icon,
  title,
  description,
  action,
}: {
  done: boolean;
  icon: React.FunctionComponent;
  title: string;
  description: string;
  action: React.ReactNode;
}) {
  return (
    <Box
      padding="400"
      borderColor="border"
      borderWidth="025"
      borderRadius="300"
      background={done ? "bg-surface-secondary" : "bg-surface"}
    >
      <InlineStack align="space-between" blockAlign="center" gap="400">
        <InlineStack gap="300" blockAlign="center">
          <Box>
            <Icon source={done ? CheckCircleIcon : icon} tone={done ? "success" : "base"} />
          </Box>
          <BlockStack gap="050">
            <Text as="h3" variant="headingSm">
              {title}
            </Text>
            <Text as="p" variant="bodySm" tone="subdued">
              {description}
            </Text>
          </BlockStack>
        </InlineStack>
        {action}
      </InlineStack>
    </Box>
  );
}

export default function Index() {
  const { configuredCount, libraryCount, embedEnabled, isPro, themeEditorUrl } =
    useLoaderData<typeof loader>();
  const hasConfigured = configuredCount > 0 || libraryCount > 0;
  const allDone = hasConfigured && embedEnabled;

  return (
    <Page>
      <TitleBar title="Swatchbox" />
      <BlockStack gap="500">
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <BlockStack gap="100">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text as="h2" variant="headingMd">
                      Get started
                    </Text>
                    <Badge tone={hasConfigured ? "success" : "attention"}>
                      {hasConfigured
                        ? `${configuredCount} product${configuredCount === 1 ? "" : "s"} configured`
                        : "Not set up yet"}
                    </Badge>
                  </InlineStack>
                  <Text as="p" variant="bodyMd" tone="subdued">
                    Turn plain variant dropdowns into clean, clickable color and image
                    swatches on your storefront. Three steps to go live.
                  </Text>
                </BlockStack>

                <Divider />

                <BlockStack gap="300">
                  <StepCard
                    done={hasConfigured}
                    icon={ColorIcon}
                    title="1. Configure a product's swatches"
                    description="Pick a product, map its Color option values to swatch colors, and save."
                    action={
                      <Button variant="primary" url="/app/products">
                        Configure
                      </Button>
                    }
                  />
                  <StepCard
                    done={embedEnabled}
                    icon={ThemeEditIcon}
                    title="2. Enable the app embed in your theme"
                    description="Toggle Swatchbox on in the theme editor, then confirm it in Settings."
                    action={
                      <Button url={themeEditorUrl} target="_blank">
                        Open theme editor
                      </Button>
                    }
                  />
                  <StepCard
                    done={allDone}
                    icon={ViewIcon}
                    title="3. View it on your storefront"
                    description="Open a configured product page and click the swatches to switch variants."
                    action={
                      <Button url="/app/settings" variant="plain">
                        Settings
                      </Button>
                    }
                  />
                </BlockStack>
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <BlockStack gap="500">
              <Card>
                <BlockStack gap="200">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text as="h2" variant="headingMd">
                      Your plan
                    </Text>
                    <Badge tone={isPro ? "success" : undefined}>
                      {isPro ? "Pro" : "Free"}
                    </Badge>
                  </InlineStack>
                  {isPro ? (
                    <Text as="p" variant="bodySm" tone="subdued">
                      All features unlocked. Thanks for being a Pro!
                    </Text>
                  ) : (
                    <BlockStack gap="200">
                      <Text as="p" variant="bodySm" tone="subdued">
                        Unlock image swatches, buttons, badges, inventory rules and
                        collection swatches for $5/month.
                      </Text>
                      <Button url="/app/billing" variant="primary">
                        Upgrade to Pro
                      </Button>
                    </BlockStack>
                  )}
                </BlockStack>
              </Card>
              <Card>
                <BlockStack gap="200">
                  <Text as="h2" variant="headingMd">
                    Quick links
                  </Text>
                  <BlockStack gap="100">
                    <RemixLink to="/app/products">Products</RemixLink>
                    <RemixLink to="/app/library">Color library</RemixLink>
                    <RemixLink to="/app/display-types">Display types</RemixLink>
                    <RemixLink to="/app/inventory">Inventory</RemixLink>
                    <RemixLink to="/app/collections">Collections</RemixLink>
                    <RemixLink to="/app/settings">Settings</RemixLink>
                  </BlockStack>
                </BlockStack>
              </Card>
              <Card>
                <BlockStack gap="200">
                  <Text as="h2" variant="headingMd">
                    How it works
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Swatchbox saves your config to your store's metafields and renders
                    swatches on the storefront with a lightweight theme extension — no
                    theme code edits, and no extra page requests.
                  </Text>
                </BlockStack>
              </Card>
            </BlockStack>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
