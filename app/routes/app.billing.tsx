import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  InlineStack,
  Text,
  Button,
  Badge,
  List,
  Box,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import {
  PRO_PLAN,
  BILLING_TEST,
  getPlanStatus,
} from "../models/billing.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { billing } = await authenticate.admin(request);
  const status = await getPlanStatus(billing);
  return { isPro: status.isPro, subscriptions: status.subscriptions, test: BILLING_TEST };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { billing, session } = await authenticate.admin(request);
  const form = await request.formData();
  const intent = String(form.get("intent"));

  if (intent === "upgrade") {
    return billing.request({
      plan: PRO_PLAN,
      isTest: BILLING_TEST,
      returnUrl: `https://${session.shop}/admin/apps/${process.env.SHOPIFY_API_KEY}/app/billing`,
    } as never);
  }

  if (intent === "cancel") {
    const id = String(form.get("subscriptionId"));
    if (id)
      await billing.cancel({
        subscriptionId: id,
        isTest: BILLING_TEST,
        prorate: true,
      });
    return { ok: true };
  }

  return { ok: false };
};

const FREE_FEATURES = [
  "Color swatches",
  "Variant-image swatches",
  "Color library + auto-sync",
  "Swatch shape & size",
];

const PRO_FEATURES = [
  "Everything in Free, plus:",
  "Custom image swatches (upload)",
  "Button & dropdown pickers",
  "Price, labels, sale badges & size charts",
  "Out-of-stock rules & low-stock alerts",
  "Collection & search page swatches",
  "CSV bulk import",
];

export default function Billing() {
  const { isPro, subscriptions } = useLoaderData<typeof loader>();
  const upgrade = useFetcher();
  const cancel = useFetcher();
  const subId = subscriptions[0]?.id;

  return (
    <Page>
      <TitleBar title="Plans" />
      <BlockStack gap="400">
        <Layout>
          <Layout.Section variant="oneHalf">
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h2" variant="headingLg">
                    Free
                  </Text>
                  {!isPro && <Badge tone="success">Current plan</Badge>}
                </InlineStack>
                <Text as="p" variant="heading2xl">
                  $0
                </Text>
                <List>
                  {FREE_FEATURES.map((f) => (
                    <List.Item key={f}>{f}</List.Item>
                  ))}
                </List>
                <Box minHeight="36px" />
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section variant="oneHalf">
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h2" variant="headingLg">
                    Pro
                  </Text>
                  {isPro && <Badge tone="success">Current plan</Badge>}
                </InlineStack>
                <Text as="p" variant="heading2xl">
                  $10<Text as="span" variant="bodyMd" tone="subdued"> / month</Text>
                </Text>
                <List>
                  {PRO_FEATURES.map((f) => (
                    <List.Item key={f}>{f}</List.Item>
                  ))}
                </List>
                {isPro ? (
                  <cancel.Form method="post">
                    <input type="hidden" name="intent" value="cancel" />
                    <input type="hidden" name="subscriptionId" value={subId ?? ""} />
                    <Button
                      submit
                      variant="plain"
                      tone="critical"
                      loading={cancel.state !== "idle"}
                    >
                      Cancel subscription
                    </Button>
                  </cancel.Form>
                ) : (
                  <upgrade.Form method="post">
                    <input type="hidden" name="intent" value="upgrade" />
                    <Button submit variant="primary" loading={upgrade.state !== "idle"}>
                      Upgrade to Pro
                    </Button>
                  </upgrade.Form>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
