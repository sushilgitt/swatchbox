import { useState } from "react";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useNavigate } from "@remix-run/react";
import {
  Page,
  Card,
  IndexTable,
  Badge,
  Text,
  Thumbnail,
  EmptyState,
  InlineStack,
  useIndexResourceState,
} from "@shopify/polaris";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { parseConfig } from "../models/swatch.server";

const numericId = (gid: string) => gid.split("/").pop() ?? gid;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;

  const configs = await prisma.productConfig.findMany({
    where: { shop },
    orderBy: { updatedAt: "desc" },
  });

  let titles: Record<string, { title: string; image: string | null }> = {};
  if (configs.length) {
    const res = await admin.graphql(
      `#graphql
        query SwatchboxProductTitles($ids: [ID!]!) {
          nodes(ids: $ids) {
            ... on Product { id title featuredImage { url } }
          }
        }`,
      { variables: { ids: configs.map((c) => c.productId) } },
    );
    const body = await res.json();
    for (const node of body.data.nodes ?? []) {
      if (node?.id) {
        titles[node.id] = {
          title: node.title,
          image: node.featuredImage?.url ?? null,
        };
      }
    }
  }

  const products = configs.map((c) => {
    const parsed = parseConfig(c);
    return {
      productId: c.productId,
      idNum: numericId(c.productId),
      title: titles[c.productId]?.title ?? "(deleted product)",
      image: titles[c.productId]?.image ?? null,
      swatchOption: parsed?.swatchOption ?? "—",
      valueCount: parsed?.values.length ?? 0,
      status: c.metafieldSyncStatus,
      updatedAt: c.updatedAt.toISOString(),
    };
  });

  return { products };
};

type Product = Awaited<ReturnType<typeof loader>>["products"][number];

function statusBadge(status: Product["status"]) {
  if (status === "SYNCED") return <Badge tone="success">Live</Badge>;
  if (status === "ERROR") return <Badge tone="critical">Error</Badge>;
  return <Badge tone="attention">Pending</Badge>;
}

export default function ProductsIndex() {
  const { products } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const shopify = useAppBridge();
  const [picking, setPicking] = useState(false);

  const pickProduct = async () => {
    setPicking(true);
    try {
      const selection = await shopify.resourcePicker({
        type: "product",
        multiple: false,
      });
      if (selection && selection.length > 0) {
        navigate(`/app/products/${numericId(selection[0].id)}`);
      }
    } finally {
      setPicking(false);
    }
  };

  const resourceName = { singular: "product", plural: "products" };
  const { selectedResources, allResourcesSelected, handleSelectionChange } =
    useIndexResourceState(products, {
      resourceIDResolver: (p) => p.productId,
    });

  return (
    <Page>
      <TitleBar title="Products">
        <button variant="primary" onClick={pickProduct}>
          Add product
        </button>
      </TitleBar>
      <Card padding="0">
        {products.length === 0 ? (
          <EmptyState
            heading="Configure swatches for a product"
            action={{
              content: "Add product",
              onAction: pickProduct,
              loading: picking,
            }}
            image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
          >
            <p>
              Pick a product, map its option values to swatch colors, and they'll
              render on your storefront.
            </p>
          </EmptyState>
        ) : (
          <IndexTable
            resourceName={resourceName}
            itemCount={products.length}
            selectedItemsCount={
              allResourcesSelected ? "All" : selectedResources.length
            }
            onSelectionChange={handleSelectionChange}
            selectable={false}
            headings={[
              { title: "Product" },
              { title: "Swatch option" },
              { title: "Values" },
              { title: "Status" },
            ]}
          >
            {products.map((p, index) => (
              <IndexTable.Row
                id={p.productId}
                key={p.productId}
                position={index}
                onClick={() => navigate(`/app/products/${p.idNum}`)}
              >
                <IndexTable.Cell>
                  <InlineStack gap="300" blockAlign="center">
                    <Thumbnail
                      source={p.image ?? ""}
                      alt={p.title}
                      size="small"
                    />
                    <Text as="span" variant="bodyMd" fontWeight="semibold">
                      {p.title}
                    </Text>
                  </InlineStack>
                </IndexTable.Cell>
                <IndexTable.Cell>{p.swatchOption}</IndexTable.Cell>
                <IndexTable.Cell>{p.valueCount}</IndexTable.Cell>
                <IndexTable.Cell>{statusBadge(p.status)}</IndexTable.Cell>
              </IndexTable.Row>
            ))}
          </IndexTable>
        )}
      </Card>
    </Page>
  );
}
