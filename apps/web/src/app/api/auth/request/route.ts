import { NextRequest } from "next/server";
import { z } from "zod";
import { requestMagicLink } from "@/server/auth";

const Body = z.object({ email: z.string().email() });

export async function POST(req: NextRequest) {
  const parse = Body.safeParse(await req.json());
  if (!parse.success) {
    return Response.json({ error: parse.error.flatten() }, { status: 400 });
  }
  try {
    const { token, expiresAt } = await requestMagicLink(parse.data.email);
    const origin = req.nextUrl.origin;
    const link = `${origin}/api/auth/verify?token=${encodeURIComponent(token)}`;

    // v1: no real email provider — log the link so local dev + droplet ops
    // can pull it out of the worker logs. Swap for SES/Postmark when a
    // domain is actually receiving email at dontopedia.com.
    console.log(`[auth] magic link for ${parse.data.email}: ${link}`);

    return Response.json({
      ok: true,
      // In dev, expose the link so we don't need email wired up.
      devLink: process.env.NODE_ENV !== "production" ? link : undefined,
      expiresAt: expiresAt.toISOString(),
    });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "internal" },
      { status: 400 },
    );
  }
}
