/**
 * ছবি রাখার জায়গা — দোকানের নিজের Durable Object SQLite-এ।
 * R2-এর মতো put/get/delete, তাই বাকি কোড একই থাকে।
 */
import type { SqlDatabase } from "../sql-adapter";

const CHUNK = 1024 * 1024;

export interface ImageStore {
  put(key: string, data: ArrayBuffer, opts?: { httpMetadata?: { contentType?: string } }): Promise<void>;
  get(key: string): Promise<{ type: string; body: Uint8Array } | null>;
  delete(key: string): Promise<void>;
}

/** imageStorageKey-এর "shops/<id>/" অংশ বাদ — প্রতিটা দোকানের ডাটাবেস আলাদাই */
const localKey = (k: string) => k.replace(/^shops\/[^/]+\//, "");

export class SqlImageStore implements ImageStore {
  constructor(private readonly db: SqlDatabase) {}

  async put(key: string, data: ArrayBuffer, opts?: { httpMetadata?: { contentType?: string } }) {
    const k = localKey(key);
    const bytes = new Uint8Array(data);
    const n = Math.max(1, Math.ceil(bytes.byteLength / CHUNK));
    const stmts = [
      this.db.prepare("DELETE FROM image_chunks WHERE key = ?").bind(k),
      this.db.prepare("INSERT OR REPLACE INTO images (key, type, size, chunks) VALUES (?, ?, ?, ?)").bind(k, opts?.httpMetadata?.contentType || "application/octet-stream", bytes.byteLength, n),
    ];
    for (let i = 0; i < n; i++) {
      stmts.push(this.db.prepare("INSERT INTO image_chunks (key, idx, data) VALUES (?, ?, ?)").bind(k, i, bytes.subarray(i * CHUNK, (i + 1) * CHUNK)));
    }
    await this.db.batch(stmts);
  }

  async get(key: string) {
    const k = localKey(key);
    const meta = await this.db.prepare("SELECT type, size FROM images WHERE key = ?").bind(k).first<{ type: string; size: number }>();
    if (!meta) return null;
    const { results } = await this.db.prepare("SELECT data FROM image_chunks WHERE key = ? ORDER BY idx").bind(k).all<{ data: ArrayBuffer }>();
    const body = new Uint8Array(meta.size);
    let off = 0;
    for (const r of results) {
      const part = new Uint8Array(r.data);
      body.set(part, off);
      off += part.byteLength;
    }
    return { type: meta.type, body };
  }

  async delete(key: string) {
    const k = localKey(key);
    await this.db.batch([
      this.db.prepare("DELETE FROM image_chunks WHERE key = ?").bind(k),
      this.db.prepare("DELETE FROM images WHERE key = ?").bind(k),
    ]);
  }
}
