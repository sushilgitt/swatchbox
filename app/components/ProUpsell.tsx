import { Page, Card, BlockStack, Text, Button, Badge, Box } from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";

/** Full-page lock shown when a Free-plan merchant opens a Pro-only feature. */
export function ProUpsell({
  title,
  feature,
}: {
  title: string;
  feature: string;
}) {
  return (
    <Page>
      <TitleBar title={title} />
      <Card>
        <BlockStack gap="300">
          <Badge tone="info">Pro feature</Badge>
          <Text as="h2" variant="headingMd">
            {feature} is available on the Pro plan
          </Text>
          <Text as="p" tone="subdued">
            Upgrade to Pro ($5/month) to unlock {feature.toLowerCase()}, plus image
            swatches, buttons & dropdowns, badges, inventory rules and collection
            swatches.
          </Text>
          <Box>
            <Button url="/app/billing" variant="primary">
              Upgrade to Pro
            </Button>
          </Box>
        </BlockStack>
      </Card>
    </Page>
  );
}
