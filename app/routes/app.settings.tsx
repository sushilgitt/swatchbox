import type { LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { ComingSoonPage } from "../components/ComingSoonPage";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

export default function Settings() {
  return (
    <ComingSoonPage
      title="Settings"
      description="General app settings, onboarding, default display preferences, and plan management."
      phase="Phase 8"
    />
  );
}
