import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

/**
 * StorageProvider — where uploaded screenshots/photos live.
 * Local implementation writes to ./.data/uploads; a Supabase Storage implementation can
 * replace it without touching callers.
 */
export interface StorageProvider {
  save(bytes: Buffer, mediaType: string): Promise<string>;
  read(name: string): Promise<{ bytes: Buffer; mediaType: string } | undefined>;
}

const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" };
const TYPE: Record<string, string> = Object.fromEntries(Object.entries(EXT).map(([k, v]) => [v, k]));

class LocalStorage implements StorageProvider {
  private dir = path.join(process.cwd(), ".data", "uploads");

  async save(bytes: Buffer, mediaType: string): Promise<string> {
    fs.mkdirSync(this.dir, { recursive: true });
    const name = `${randomUUID()}.${EXT[mediaType] ?? "bin"}`;
    fs.writeFileSync(path.join(this.dir, name), bytes);
    return `/api/uploads/${name}`;
  }

  async read(name: string) {
    if (!/^[0-9a-f-]{36}\.(png|jpg|webp|gif)$/.test(name)) return undefined;
    const file = path.join(this.dir, name);
    if (!fs.existsSync(file)) return undefined;
    return { bytes: fs.readFileSync(file), mediaType: TYPE[name.split(".").pop()!] ?? "application/octet-stream" };
  }
}

export const storage: StorageProvider = new LocalStorage();
