import { type NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

// Only API traffic and auth pages need a refreshed Supabase session. Core PWA
// pages stay independent of the backend so they work offline.
export const config = {
  matcher: ["/api/:path*", "/login"]
};
