/**
 * ছবি রাখার জায়গা — দোকানের নিজের Durable Object SQLite-এ, আর R2 চালু থাকলে R2-তেও (MirrorImageStore)।
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
export const localKey = (k: string) => k.replace(/^shops\/[^/]+\//, "");

/** R2-তে যায় না: সাপোর্টের স্ক্রিনশট (পাবলিক ঠিকানায় রাখা ঠিক নয়) */
export const r2Skip = (key: string) => localKey(key).startsWith("support/");

/** R2-তে ছবির ঠিকানা — পুরনো R2 নিয়মের মতোই shops/<দোকান>/<key> */
export const r2Key = (shopId: string, key: string) => `shops/${shopId}/${localKey(key)}`;

export const R2_CACHE = "public, max-age=31536000, immutable";

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
    if (!results.length && meta.size > 0) return null; // কপি R2-তে সরানো হয়েছে
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

/**
 * দোকানের ডাটাবেস + R2 একসাথে।
 * - put: দুই জায়গায় (R2 না গেলে images.r2 = 0 থাকে, পরের সিঙ্কে আবার যায়)
 * - get: আগে নিজের ডাটাবেস, না পেলে (মোছা হয়ে থাকলে) R2
 * - delete: দুই জায়গা থেকে
 */
export class MirrorImageStore implements ImageStore {
  readonly local: SqlImageStore;
  constructor(private readonly db: SqlDatabase, private readonly bucket: R2Bucket, private readonly shopId: string, private readonly onFail?: () => Promise<void>) {
    this.local = new SqlImageStore(db);
  }

  async put(key: string, data: ArrayBuffer, opts?: { httpMetadata?: { contentType?: string } }) {
    await this.local.put(key, data, opts);
    if (r2Skip(key)) return;
    try {
      await this.bucket.put(r2Key(this.shopId, key), data, { httpMetadata: { contentType: opts?.httpMetadata?.contentType || "application/octet-stream", cacheControl: R2_CACHE } });
      await this.db.prepare("UPDATE images SET r2 = 1 WHERE key = ?").bind(localKey(key)).run();
    } catch (e) {
      console.error("r2 put failed", key, e);
      await this.onFail?.().catch(() => {});
    }
  }

  async get(key: string) {
    const own = await this.local.get(key);
    if (own || r2Skip(key)) return own;
    const obj = await this.bucket.get(r2Key(this.shopId, key)).catch(() => null);
    if (!obj) return null;
    return { type: obj.httpMetadata?.contentType || "application/octet-stream", body: new Uint8Array(await obj.arrayBuffer()) };
  }

  async delete(key: string) {
    await this.local.delete(key);
    if (!r2Skip(key)) await this.bucket.delete(r2Key(this.shopId, key)).catch((e) => console.error("r2 delete failed", key, e));
  }
}
