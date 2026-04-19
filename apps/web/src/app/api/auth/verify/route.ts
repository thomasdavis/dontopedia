import { NextRequest } from "next/server";
import { verifyMagicLink } from "@/server/auth";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) {
    return Response.redirect(new URL("/login?error=missing", req.url));
  }
  try {
    await verifyMagicLink(token);
  } catch {
    return Response.redirect(new URL("/login?error=invalid", req.url));
  }
  return Response.redirect(new URL("/", req.url));
}
