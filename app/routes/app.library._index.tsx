import type { LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { ComingSoonPage } from "../components/ComingSoonPage";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

export default function Library() {
  return (
    <ComingSoonPage
      title="Color library"
      description="A reusable library of color names mapped to swatch colors and images, plus CSV import and auto-sync from your products."
      phase="Phase 2"
    />
  );
}
