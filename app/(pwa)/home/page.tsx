import { HomeScreen } from "@/features/app/home-screen";

// Static shell: session and inbox load on the client, so this page can be precached and work offline.
export default function HomePage() {
  return <HomeScreen />;
}
