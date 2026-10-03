import { Suspense } from "react";

import { SettingsScreen } from "@/features/settings/settings-screen";

// Static shell; account state loads on the client so the page is precacheable.
export default function SettingsPage() {
  return (
    <Suspense fallback={null}>
      <SettingsScreen />
    </Suspense>
  );
}
