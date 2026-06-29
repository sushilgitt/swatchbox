import { useEffect, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { useFetcher, useLoaderData } from "@remix-run/react";
import {
  Page,
  Card,
  BlockStack,
  Text,
  TextField,
  ChoiceList,
  Box,
  InlineStack,
} from "@shopify/polaris";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import {
  updateInventorySettings,
  publishGlobal,
} from "../models/library.server";
import { getOrCreateShopSettings } from "../models/swatch.server";
import { getPlanStatus, requirePro } from "../models/billing.server";
import { ProUpsell } from "../components/ProUpsell";

type Oos = "NONE" | "DISABLE" | "HIDE";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, billing } = await authenticate.admin(request);
  const [s, plan] = await Promise.all([
    getOrCreateShopSettings(session.shop),
    getPlanStatus(billing),
  ]);
  return {
    isPro: plan.isPro,
    oosBehavior: s.oosBehavior as Oos,
    lowStockThreshold: s.lowStockThreshold,
    lowStockMessage: s.lowStockMessage,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session, billing } = await authenticate.admin(request);
  const gate = await requirePro(billing);
  if (gate) return gate;
  const shop = session.shop;
  const form = await request.formData();
  const payload = JSON.parse(String(form.get("payload"))) as {
    oosBehavior: Oos;
    lowStockThreshold: number;
    lowStockMessage: string;
  };
  await updateInventorySettings(shop, {
    oosBehavior: payload.oosBehavior,
    lowStockThreshold: payload.lowStockThreshold,
    lowStockMessage: payload.lowStockMessage,
  });
  await publishGlobal(admin, shop);
  return { ok: true };
};

export default function Inventory() {
  const data = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();

  const [oos, setOos] = useState<Oos>(data.oosBehavior);
  const [threshold, setThreshold] = useState(String(data.lowStockThreshold));
  const [message, setMessage] = useState(data.lowStockMessage);

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.ok) {
      shopify.toast.show("Inventory settings saved");
    }
  }, [fetcher.state, fetcher.data, shopify]);

  const save = () => {
    fetcher.submit(
      {
        payload: JSON.stringify({
          oosBehavior: oos,
          lowStockThreshold: parseInt(threshold, 10) || 0,
          lowStockMessage: message,
        }),
      },
      { method: "POST" },
    );
  };

  const saving = fetcher.state !== "idle";

  if (!data.isPro) {
    return <ProUpsell title="Inventory" feature="Inventory rules" />;
  }

  return (
    <Page>
      <TitleBar title="Inventory">
        <button variant="primary" onClick={save}>
          {saving ? "Saving…" : "Save"}
        </button>
      </TitleBar>

      <BlockStack gap="500">
        <Card>
          <BlockStack gap="400">
            <BlockStack gap="100">
              <Text as="h2" variant="headingMd">
                Out-of-stock options
              </Text>
              <Text as="p" tone="subdued" variant="bodySm">
                What to do with a swatch when none of its variants are in stock.
              </Text>
            </BlockStack>
            <ChoiceList
              title="When an option is out of stock"
              titleHidden
              choices={[
                { label: "Do nothing (still selectable)", value: "NONE" },
                {
                  label: "Disable it (greyed out, not clickable)",
                  value: "DISABLE",
                },
                { label: "Hide it completely", value: "HIDE" },
              ]}
              selected={[oos]}
              onChange={(v) => setOos(v[0] as Oos)}
            />
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="400">
            <BlockStack gap="100">
              <Text as="h2" variant="headingMd">
                Low-stock alert
              </Text>
              <Text as="p" tone="subdued" variant="bodySm">
                Show a message when the selected option is running low. Set the
                threshold to 0 to turn this off.
              </Text>
            </BlockStack>
            <InlineStack gap="400" blockAlign="start">
              <Box minWidth="160px">
                <TextField
                  label="Low-stock threshold"
                  type="number"
                  min={0}
                  value={threshold}
                  onChange={setThreshold}
                  autoComplete="off"
                  helpText="e.g. 5"
                />
              </Box>
              <Box minWidth="320px">
                <TextField
                  label="Message"
                  value={message}
                  onChange={setMessage}
                  autoComplete="off"
                  helpText="Use {qty} for the remaining quantity."
                />
              </Box>
            </InlineStack>
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
