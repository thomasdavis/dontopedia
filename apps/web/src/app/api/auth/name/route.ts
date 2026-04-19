import { NextRequest } from "next/server";
import { z } from "zod";
import { setDisplayName } from "@/server/auth";

const Body = z.object({ displayName: z.string().min(1).max(80) });

export async function POST(req: NextRequest) {
  const parse = Body.safeParse(await req.json());
  if (!parse.success) {
    return Response.json({ error: parse.error.flatten() }, { status: 400 });
  }
  const identity = await setDisplayName(parse.data.displayName);
  return Response.json({ identity });
}
