import { Page, Layout, Card, BlockStack, Text, Badge } from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";

/**
 * Placeholder for routes that exist in the nav but whose feature ships in a
 * later phase. Keeps the IA navigable without dead links.
 */
export function ComingSoonPage({
  title,
  description,
  phase,
}: {
  title: string;
  description: string;
  phase?: string;
}) {
  return (
    <Page>
      <TitleBar title={title} />
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Badge tone="info">{phase ? `Coming in ${phase}` : "Coming soon"}</Badge>
              <Text as="h2" variant="headingMd">
                {title}
              </Text>
              <Text as="p" tone="subdued">
                {description}
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
