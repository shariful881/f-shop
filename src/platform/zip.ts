/**
 * ছোট ZIP লেখক — ফাইল এক এক করে যোগ হয় আর সাথে সাথে ডাউনলোডে চলে যায় (streaming),
 * তাই পুরো ব্যাকআপ একবারে মেমরিতে রাখতে হয় না। প্রতিটা ফাইল আলাদাভাবে মেমরিতে আসে।
 * লেখা (JSON/CSV/SQL) deflate করে ছোট হয়; ছবি আর ZIP যেমন আছে তেমন (আবার চাপলে লাভ নেই)।
 * মোট ৪ GB-র বেশি হলে ZIP64 (Windows, macOS, 7-Zip সবাই খোলে)।
 */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

async function deflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const cs = new CompressionStream("deflate-raw");
  const out = new Response(new Blob([data]).stream().pipeThrough(cs)).arrayBuffer();
  return new Uint8Array(await out);
}

const enc = new TextEncoder();
const MAX32 = 0xffffffff;

type Entry = { name: Uint8Array; crc: number; csize: number; usize: number; offset: number; method: number; time: number; date: number };

function dosTime(d: Date) {
  // ZIP-এর সময় স্থানীয় ধরা হয় — ঢাকার সময় (UTC+6) লেখা
  const t = new Date(d.getTime() + 6 * 3600_000);
  return {
    time: (t.getUTCHours() << 11) | (t.getUTCMinutes() << 5) | Math.floor(t.getUTCSeconds() / 2),
    date: ((t.getUTCFullYear() - 1980) << 9) | ((t.getUTCMonth() + 1) << 5) | t.getUTCDate(),
  };
}

export class ZipWriter {
  readonly readable: ReadableStream<Uint8Array>;
  private writer: WritableStreamDefaultWriter<Uint8Array>;
  private entries: Entry[] = [];
  private offset = 0;
  private names = new Set<string>();
  /** যোগ হওয়া ফাইল আর মোট বাইট (README/manifest-এর জন্য) */
  readonly files: { path: string; bytes: number; crc: string }[] = [];

  constructor() {
    const ts = new TransformStream<Uint8Array, Uint8Array>(undefined, undefined, { highWaterMark: 4 });
    this.readable = ts.readable;
    this.writer = ts.writable.getWriter();
  }

  private async write(b: Uint8Array) {
    await this.writer.write(b);
    this.offset += b.length;
  }

  /** একটা ফাইল যোগ — compress = false হলে যেমন আছে তেমন (ছবি, zip) */
  async add(path: string, data: Uint8Array | string, opts: { compress?: boolean; date?: Date } = {}) {
    let p = path.replace(/^\/+/, "").replace(/\\/g, "/");
    if (this.names.has(p)) { let i = 2; while (this.names.has(p.replace(/(\.[^./]+)?$/, `-${i}$1`))) i++; p = p.replace(/(\.[^./]+)?$/, `-${i}$1`); }
    this.names.add(p);
    const raw = typeof data === "string" ? enc.encode(data) : data;
    const crc = crc32(raw);
    let body = raw;
    let method = 0;
    if (opts.compress !== false && raw.length > 64) {
      const z = await deflateRaw(raw);
      if (z.length < raw.length) { body = z; method = 8; }
    }
    const name = enc.encode(p);
    const { time, date } = dosTime(opts.date ?? new Date());
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true);
    h.setUint16(4, 20, true);
    h.setUint16(6, 0x0800, true); // নাম UTF-8
    h.setUint16(8, method, true);
    h.setUint16(10, time, true);
    h.setUint16(12, date, true);
    h.setUint32(14, crc, true);
    h.setUint32(18, body.length, true);
    h.setUint32(22, raw.length, true);
    h.setUint16(26, name.length, true);
    h.setUint16(28, 0, true);
    const offset = this.offset;
    await this.write(new Uint8Array(h.buffer));
    await this.write(name);
    await this.write(body);
    this.entries.push({ name, crc, csize: body.length, usize: raw.length, offset, method, time, date });
    this.files.push({ path: p, bytes: raw.length, crc: crc.toString(16).padStart(8, "0") });
  }

  /** শেষ: ফাইলের তালিকা (central directory) লিখে বন্ধ */
  async finish() {
    const cdStart = this.offset;
    for (const e of this.entries) {
      const big = e.offset >= MAX32;
      const extra = big ? new DataView(new ArrayBuffer(12)) : null;
      if (extra) { extra.setUint16(0, 0x0001, true); extra.setUint16(2, 8, true); extra.setBigUint64(4, BigInt(e.offset), true); }
      const h = new DataView(new ArrayBuffer(46));
      h.setUint32(0, 0x02014b50, true);
      h.setUint16(4, (3 << 8) | 45, true); // তৈরি: Unix, ভার্সন ৪.৫
      h.setUint16(6, big ? 45 : 20, true);
      h.setUint16(8, 0x0800, true);
      h.setUint16(10, e.method, true);
      h.setUint16(12, e.time, true);
      h.setUint16(14, e.date, true);
      h.setUint32(16, e.crc, true);
      h.setUint32(20, e.csize, true);
      h.setUint32(24, e.usize, true);
      h.setUint16(28, e.name.length, true);
      h.setUint16(30, extra ? 12 : 0, true);
      h.setUint16(32, 0, true);
      h.setUint16(34, 0, true);
      h.setUint16(36, 0, true);
      h.setUint32(38, (0o100644 << 16) >>> 0, true); // সাধারণ ফাইল, rw-r--r--
      h.setUint32(42, big ? MAX32 : e.offset, true);
      await this.write(new Uint8Array(h.buffer));
      await this.write(e.name);
      if (extra) await this.write(new Uint8Array(extra.buffer));
    }
    const cdSize = this.offset - cdStart;
    const n = this.entries.length;
    const z64 = n >= 0xffff || cdStart >= MAX32 || cdSize >= MAX32;
    if (z64) {
      const at = this.offset;
      const r = new DataView(new ArrayBuffer(56));
      r.setUint32(0, 0x06064b50, true);
      r.setBigUint64(4, 44n, true);
      r.setUint16(12, 45, true);
      r.setUint16(14, 45, true);
      r.setUint32(16, 0, true);
      r.setUint32(20, 0, true);
      r.setBigUint64(24, BigInt(n), true);
      r.setBigUint64(32, BigInt(n), true);
      r.setBigUint64(40, BigInt(cdSize), true);
      r.setBigUint64(48, BigInt(cdStart), true);
      await this.write(new Uint8Array(r.buffer));
      const l = new DataView(new ArrayBuffer(20));
      l.setUint32(0, 0x07064b50, true);
      l.setUint32(4, 0, true);
      l.setBigUint64(8, BigInt(at), true);
      l.setUint32(16, 1, true);
      await this.write(new Uint8Array(l.buffer));
    }
    const e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true);
    e.setUint16(8, z64 ? 0xffff : n, true);
    e.setUint16(10, z64 ? 0xffff : n, true);
    e.setUint32(12, z64 ? MAX32 : cdSize, true);
    e.setUint32(16, z64 ? MAX32 : cdStart, true);
    await this.write(new Uint8Array(e.buffer));
    await this.writer.close();
  }

  async abort(reason: unknown) {
    await this.writer.abort(reason).catch(() => {});
  }
}
