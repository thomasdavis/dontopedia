import { NextRequest } from "next/server";
import { reactionsFor } from "@donto/client/react";

/** Proxy the read so the browser talks only to the web origin. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const base = process.env.DONTOSRV_URL ?? "http://localhost:7878";
  try {
    const res = await reactionsFor(base, id);
    return Response.json(res);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "fetch failed" },
      { status: 502 },
    );
  }
}
