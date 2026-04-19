import { forgetIdentity } from "@/server/auth";

export async function POST() {
  await forgetIdentity();
  return Response.json({ ok: true });
}
