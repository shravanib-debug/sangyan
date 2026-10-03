import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { readPublicEnvironment } from "@/lib/env/public";

export async function createClient() {
  const cookieStore = await cookies();
  const environment = readPublicEnvironment();

  return createServerClient(
    environment.NEXT_PUBLIC_SUPABASE_URL,
    environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Called from a Server Component; the proxy refreshes the session.
          }
        }
      }
    }
  );
}
