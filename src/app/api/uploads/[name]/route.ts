import { storage } from "@/server/storage";

export async function GET(_: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const file = await storage.read(name);
  if (!file) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(file.bytes), { headers: { "content-type": file.mediaType, "cache-control": "private, max-age=31536000, immutable" } });
}
