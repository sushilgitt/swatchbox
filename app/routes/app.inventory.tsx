import type { LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { ComingSoonPage } from "../components/ComingSoonPage";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

export default function Inventory() {
  return (
    <ComingSoonPage
      title="Inventory"
      description="Hide or disable out-of-stock variants and show low-stock alerts with a custom message."
      phase="Phase 6"
    />
  );
}
