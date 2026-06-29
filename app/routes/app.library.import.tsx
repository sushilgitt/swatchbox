import { useState, useCallback, useEffect } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { useFetcher, useLoaderData } from "@remix-run/react";
import {
  Page,
  Card,
  DropZone,
  BlockStack,
  InlineStack,
  Text,
  Button,
  Banner,
  Box,
  DataTable,
  Badge,
} from "@shopify/polaris";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { parseCsv, mapLibraryRows } from "../lib/csv";
import { importLibraryRows } from "../models/library.server";
import { getPlanStatus, requirePro } from "../models/billing.server";
import { ProUpsell } from "../components/ProUpsell";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { billing } = await authenticate.admin(request);
  const { isPro } = await getPlanStatus(billing);
  return { isPro };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session, billing } = await authenticate.admin(request);
  const gate = await requirePro(billing);
  if (gate) return { ok: false, error: "Pro feature", imported: 0, invalid: 0 };
  const form = await request.formData();
  const text = String(form.get("csv") || "");
  const fileName = String(form.get("fileName") || "import.csv");
  if (!text.trim())
    return { ok: false, error: "No CSV content", imported: 0, invalid: 0 };

  const { valid, invalid } = mapLibraryRows(parseCsv(text));
  const result = await importLibraryRows(
    admin,
    session.shop,
    fileName,
    valid,
    invalid,
  );
  return {
    ok: true,
    error: null,
    imported: result.imported,
    invalid: invalid.length,
  };
};

export default function ImportCsv() {
  const { isPro } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();

  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState("");

  const preview = csv ? mapLibraryRows(parseCsv(csv)) : null;

  const onDrop = useCallback((_files: File[], accepted: File[]) => {
    const file = accepted[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => setCsv(String(reader.result || ""));
    reader.readAsText(file);
  }, []);

  const doImport = () => {
    fetcher.submit({ csv, fileName: fileName || "import.csv" }, { method: "POST" });
  };

  const importing = fetcher.state !== "idle";

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.ok) {
      shopify.toast.show(`Imported ${fetcher.data.imported} colors`);
    }
  }, [fetcher.state, fetcher.data, shopify]);

  if (!isPro) {
    return <ProUpsell title="Import colors" feature="CSV import" />;
  }

  const previewRows =
    preview?.valid.slice(0, 8).map((r) => [
      <span
        key={r.line}
        style={{
          display: "inline-block",
          width: 22,
          height: 22,
          borderRadius: "50%",
          border: "1px solid #c9cccf",
          background: r.imageUrl
            ? `center/cover no-repeat url(${r.imageUrl})`
            : r.hex || "#fff",
        }}
      />,
      r.name,
      r.hex || (r.imageUrl ? "Image" : "—"),
    ]) ?? [];

  return (
    <Page
      backAction={{ content: "Color library", url: "/app/library" }}
      title="Import colors from CSV"
    >
      <TitleBar title="Import colors" />
      <BlockStack gap="500">
        {fetcher.data?.ok && (
          <Banner
            tone="success"
            title={`Imported ${fetcher.data.imported} colors`}
            action={{ content: "Back to library", url: "/app/library" }}
          >
            {fetcher.data.invalid > 0 && (
              <p>{fetcher.data.invalid} row(s) were skipped due to errors.</p>
            )}
          </Banner>
        )}

        <Card>
          <BlockStack gap="400">
            <BlockStack gap="100">
              <Text as="h2" variant="headingMd">
                Upload a CSV
              </Text>
              <Text as="p" tone="subdued" variant="bodySm">
                Columns: <code>name,hex</code> (an optional <code>image</code>{" "}
                column is supported). Example: <code>Royal Blue,#4169e1</code>
              </Text>
            </BlockStack>

            <DropZone accept=".csv,text/csv" type="file" onDrop={onDrop} allowMultiple={false}>
              {fileName ? (
                <Box padding="400">
                  <InlineStack gap="200" align="center" blockAlign="center">
                    <Text as="span" fontWeight="medium">
                      {fileName}
                    </Text>
                    <Badge tone="success">Loaded</Badge>
                  </InlineStack>
                </Box>
              ) : (
                <DropZone.FileUpload actionTitle="Add CSV" actionHint="or drop a .csv file" />
              )}
            </DropZone>

            {preview && (
              <BlockStack gap="300">
                <InlineStack gap="300">
                  <Badge tone="success">{`${preview.valid.length} valid`}</Badge>
                  {preview.invalid.length > 0 && (
                    <Badge tone="critical">{`${preview.invalid.length} invalid`}</Badge>
                  )}
                </InlineStack>

                {previewRows.length > 0 && (
                  <DataTable
                    columnContentTypes={["text", "text", "text"]}
                    headings={["", "Name", "Value"]}
                    rows={previewRows}
                  />
                )}
                {preview.valid.length > 8 && (
                  <Text as="p" tone="subdued" variant="bodySm">
                    …and {preview.valid.length - 8} more.
                  </Text>
                )}
                {preview.invalid.length > 0 && (
                  <Banner tone="warning" title="Some rows will be skipped">
                    <p>
                      {preview.invalid
                        .slice(0, 5)
                        .map((r) => `Line ${r.line}: ${r.error}`)
                        .join(" · ")}
                      {preview.invalid.length > 5 ? " …" : ""}
                    </p>
                  </Banner>
                )}

                <InlineStack>
                  <Button
                    variant="primary"
                    onClick={doImport}
                    loading={importing}
                    disabled={preview.valid.length === 0}
                  >
                    {`Import ${preview.valid.length} colors`}
                  </Button>
                </InlineStack>
              </BlockStack>
            )}
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
