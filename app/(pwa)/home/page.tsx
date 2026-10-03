import { HomeScreen } from "@/features/app/home-screen";
import { createClient } from "@/lib/supabase/server";

export default async function HomePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return <HomeScreen user={user} />;
}
