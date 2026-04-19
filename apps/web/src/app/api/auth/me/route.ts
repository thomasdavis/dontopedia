import { currentIdentity } from "@/server/auth";

export async function GET() {
  const identity = await currentIdentity();
  return Response.json({ identity });
}
