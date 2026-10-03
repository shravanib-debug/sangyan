import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    {
      status: "ok",
      service: "thehrav-web",
      phase: 0
    },
    {
      headers: {
        "Cache-Control": "no-store"
      }
    }
  );
}
