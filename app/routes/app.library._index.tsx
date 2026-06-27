import { useEffect, useState } from "react";
import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
  SerializeFrom,
} from "@remix-run/node";
import { useFetcher, useLoaderData } from "@remix-run/react";
import {
  Page,
  Card,
  IndexTable,
  Badge,
  Text,
  Button,
  EmptyState,
  Modal,
  TextField,
  BlockStack,
  InlineStack,
  Box,
} from "@shopify/polaris";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import {
  listLibrary,
  upsertEntry,
  deleteEntry,
  publishColorLibrary,
  autoSyncFromProducts,
} from "../models/library.server";
import { isHex } from "../lib/colorNames";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const entries = await listLibrary(session.shop);
  return { entries };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  const form = await request.formData();
  const intent = String(form.get("intent"));

  if (intent === "save") {
    const name = String(form.get("name") || "").trim();
    const hex = String(form.get("hex") || "").trim();
    const imageUrl = String(form.get("imageUrl") || "").trim();
    if (!name) return { ok: false, intent, error: "Name is required", added: 0 };
    if (hex && !isHex(hex))
      return { ok: false, intent, error: "Invalid hex color", added: 0 };
    await upsertEntry(shop, {
      name,
      hex: hex || null,
      imageUrl: imageUrl || null,
      source: "MANUAL",
    });
    await publishColorLibrary(admin, shop);
    return { ok: true, intent, error: null, added: 0 };
  }

  if (intent === "delete") {
    await deleteEntry(shop, String(form.get("id")));
    await publishColorLibrary(admin, shop);
    return { ok: true, intent, error: null, added: 0 };
  }

  if (intent === "autosync") {
    const result = await autoSyncFromProducts(admin, shop);
    return { ok: true, intent, error: null, added: result.added };
  }

  return { ok: false, intent: "unknown", error: "Unknown action", added: 0 };
};

type Entry = SerializeFrom<typeof loader>["entries"][number];

function Swatch({ hex, imageUrl }: { hex: string | null; imageUrl: string | null }) {
  return (
    <span
      style={{
        display: "inline-block",
        width: 28,
        height: 28,
        borderRadius: "50%",
        border: "1px solid #c9cccf",
        background: imageUrl
          ? `center/cover no-repeat url(${imageUrl})`
          : hex || "#fff",
      }}
    />
  );
}

export default function LibraryIndex() {
  const { entries } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const sync = useFetcher<typeof action>();
  const shopify = useAppBridge();

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Entry | null>(null);
  const [name, setName] = useState("");
  const [hex, setHex] = useState("#cccccc");
  const [imageUrl, setImageUrl] = useState("");

  const openAdd = () => {
    setEditing(null);
    setName("");
    setHex("#cccccc");
    setImageUrl("");
    setModalOpen(true);
  };
  const openEdit = (e: Entry) => {
    setEditing(e);
    setName(e.name);
    setHex(e.hex || "#cccccc");
    setImageUrl(e.imageUrl || "");
    setModalOpen(true);
  };

  // close modal + toast on successful save
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.ok) {
      if (fetcher.data.intent === "save") {
        setModalOpen(false);
        shopify.toast.show("Color saved");
      } else if (fetcher.data.intent === "delete") {
        shopify.toast.show("Color removed");
      }
    }
  }, [fetcher.state, fetcher.data, shopify]);

  useEffect(() => {
    if (sync.state === "idle" && sync.data?.ok && sync.data.intent === "autosync") {
      const added = (sync.data as { added?: number }).added ?? 0;
      shopify.toast.show(
        added > 0
          ? `Added ${added} color${added === 1 ? "" : "s"} from your products`
          : "No new colors found",
      );
    }
  }, [sync.state, sync.data, shopify]);

  const saveEntry = () => {
    fetcher.submit({ intent: "save", name, hex, imageUrl }, { method: "POST" });
  };
  const removeEntry = (id: string) => {
    fetcher.submit({ intent: "delete", id }, { method: "POST" });
  };
  const runAutoSync = () => {
    sync.submit({ intent: "autosync" }, { method: "POST" });
  };

  const saving = fetcher.state !== "idle";
  const syncing = sync.state !== "idle";

  return (
    <Page>
      <TitleBar title="Color library">
        <button variant="primary" onClick={openAdd}>
          Add color
        </button>
        <button onClick={runAutoSync}>
          {syncing ? "Syncing…" : "Auto-sync from products"}
        </button>
        <button onClick={() => (window.location.href = "/app/library/import")}>
          Import CSV
        </button>
      </TitleBar>

      <Card padding="0">
        {entries.length === 0 ? (
          <EmptyState
            heading="Build your color library"
            action={{ content: "Add color", onAction: openAdd }}
            secondaryAction={{
              content: "Auto-sync from products",
              onAction: runAutoSync,
              loading: syncing,
            }}
            image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
          >
            <p>
              Map color names to swatch colors once, and they apply across every
              product's Color option automatically.
            </p>
          </EmptyState>
        ) : (
          <IndexTable
            resourceName={{ singular: "color", plural: "colors" }}
            itemCount={entries.length}
            selectable={false}
            headings={[
              { title: "" },
              { title: "Name" },
              { title: "Value" },
              { title: "Source" },
              { title: "" },
            ]}
          >
            {entries.map((e, index) => (
              <IndexTable.Row
                id={e.id}
                key={e.id}
                position={index}
                onClick={() => openEdit(e)}
              >
                <IndexTable.Cell>
                  <Swatch hex={e.hex} imageUrl={e.imageUrl} />
                </IndexTable.Cell>
                <IndexTable.Cell>
                  <Text as="span" fontWeight="semibold">
                    {e.name}
                  </Text>
                </IndexTable.Cell>
                <IndexTable.Cell>
                  {e.imageUrl ? "Image" : e.hex || "—"}
                </IndexTable.Cell>
                <IndexTable.Cell>
                  <Badge tone={e.source === "MANUAL" ? "info" : undefined}>
                    {e.source}
                  </Badge>
                </IndexTable.Cell>
                <IndexTable.Cell>
                  <Button
                    variant="plain"
                    tone="critical"
                    onClick={() => removeEntry(e.id)}
                  >
                    Delete
                  </Button>
                </IndexTable.Cell>
              </IndexTable.Row>
            ))}
          </IndexTable>
        )}
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? `Edit ${editing.name}` : "Add color"}
        primaryAction={{
          content: editing ? "Save" : "Add",
          onAction: saveEntry,
          loading: saving,
          disabled: !name.trim() || (!!hex && !isHex(hex)),
        }}
        secondaryActions={[{ content: "Cancel", onAction: () => setModalOpen(false) }]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            <TextField
              label="Color name"
              value={name}
              onChange={setName}
              autoComplete="off"
              helpText="Must match the option value on your products (e.g. “Royal Blue”)."
              disabled={!!editing}
            />
            <InlineStack gap="400" blockAlign="center">
              <label style={{ cursor: "pointer", position: "relative" }}>
                <span
                  style={{
                    display: "block",
                    width: 44,
                    height: 44,
                    borderRadius: "50%",
                    background: isHex(hex) ? hex : "#fff",
                    border: "1px solid #c9cccf",
                  }}
                />
                <input
                  type="color"
                  value={isHex(hex) ? hex : "#cccccc"}
                  onChange={(e) => setHex(e.target.value)}
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
                <TextField
                  label="Hex color"
                  value={hex}
                  onChange={setHex}
                  autoComplete="off"
                  error={hex && !isHex(hex) ? "Enter a hex like #4169e1" : undefined}
                />
              </Box>
            </InlineStack>
            <TextField
              label="Image URL (optional)"
              value={imageUrl}
              onChange={setImageUrl}
              autoComplete="off"
              helpText="For pattern/texture swatches. Overrides the hex color if set."
            />
          </BlockStack>
        </Modal.Section>
      </Modal>
    </Page>
  );
}
