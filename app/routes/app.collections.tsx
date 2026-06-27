import type { LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { ComingSoonPage } from "../components/ComingSoonPage";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

export default function Collections() {
  return (
    <ComingSoonPage
      title="Collections"
      description="Show mini-swatches on product cards across collection and search pages, with an optional 'split product by variant' display."
      phase="Phase 7"
    />
  );
}
