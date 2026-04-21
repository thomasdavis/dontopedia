import { NextRequest } from "next/server";
import { stat, open } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";

const UPLOADS_DIR = process.env.UPLOADS_DIR ?? "/uploads";

const MIME_MAP: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".csv": "text/csv",
  ".json": "application/json",
};

function guessMime(name: string): string {
  const ext = name.slice(name.lastIndexOf(".")).toLowerCase();
  return MIME_MAP[ext] ?? "application/octet-stream";
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  // Only allow a single filename segment to prevent directory traversal
  if (path.length !== 1 || path[0]!.includes("..") || path[0]!.includes("/")) {
    return new Response("not found", { status: 404 });
  }

  const filename = path[0]!;
  const filePath = join(UPLOADS_DIR, filename);

  let info;
  try {
    info = await stat(filePath);
  } catch {
    return new Response("not found", { status: 404 });
  }

  if (!info.isFile()) {
    return new Response("not found", { status: 404 });
  }

  const fh = await open(filePath, "r");
  const nodeStream = fh.createReadStream();
  // Convert Node readable stream to web ReadableStream
  const webStream = Readable.toWeb(nodeStream) as ReadableStream;

  return new Response(webStream, {
    headers: {
      "content-type": guessMime(filename),
      "content-length": String(info.size),
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}
