import type { LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { ComingSoonPage } from "../components/ComingSoonPage";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

export default function DisplayTypes() {
  return (
    <ComingSoonPage
      title="Display types"
      description="Choose how each option renders by default — color swatches, image swatches, buttons, or enhanced dropdowns — and tune swatch shape, size, and borders."
      phase="Phase 4"
    />
  );
}
