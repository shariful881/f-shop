/**
 * ধাপ ৮: নতুন অর্ডারে ফোনে নোটিফিকেশন (Web Push) — কোনো বাইরের সার্ভিস ছাড়া, খরচ ৳০।
 * VAPID চাবি একবার তৈরি হয়ে মূল ডাটাবেসে থাকে; বার্তা RFC 8291 (aes128gcm) দিয়ে এনক্রিপ্ট হয়।
 */
const enc = new TextEncoder();

export const b64u = (buf: ArrayBuffer | Uint8Array) => {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
export const unb64u = (s: string) => {
  const t = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  return Uint8Array.from(t, (ch) => ch.charCodeAt(0));
};
const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let i = 0;
  for (const p of parts) { out.set(p, i); i += p.length; }
  return out;
};

export type Vapid = { publicKey: string; privateJwk: JsonWebKey };

let vapidCache: Vapid | null = null;

/** VAPID চাবি — না থাকলে তৈরি করে মূল ডাটাবেসে রাখে */
export async function vapidKeys(platformDb: D1Database): Promise<Vapid> {
  if (vapidCache) return vapidCache;
  const read = async () => {
    const { results } = await platformDb.prepare("SELECT key, value FROM platform_settings WHERE key IN ('vapid_public', 'vapid_private')").all<{ key: string; value: string }>();
    const m = Object.fromEntries(results.map((r) => [r.key, r.value]));
    return m.vapid_public && m.vapid_private ? { publicKey: m.vapid_public, privateJwk: JSON.parse(m.vapid_private) as JsonWebKey } : null;
  };
  let v = await read();
  if (!v) {
    const pair = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
    const pub = b64u((await crypto.subtle.exportKey("raw", pair.publicKey)) as ArrayBuffer);
    const jwk = (await crypto.subtle.exportKey("jwk", pair.privateKey)) as JsonWebKey;
    await platformDb.batch([
      platformDb.prepare("INSERT OR IGNORE INTO platform_settings (key, value) VALUES ('vapid_public', ?)").bind(pub),
      platformDb.prepare("INSERT OR IGNORE INTO platform_settings (key, value) VALUES ('vapid_private', ?)").bind(JSON.stringify(jwk)),
    ]);
    v = await read();
  }
  vapidCache = v!;
  return vapidCache;
}

export function resetVapidCache() {
  vapidCache = null;
}

async function vapidJwt(v: Vapid, endpoint: string): Promise<string> {
  const aud = new URL(endpoint).origin;
  const header = b64u(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const payload = b64u(enc.encode(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: "mailto:support@sellxbd.com" })));
  const key = await crypto.subtle.importKey("jwk", v.privateJwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(`${header}.${payload}`));
  return `${header}.${payload}.${b64u(sig as ArrayBuffer)}`;
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, bytes: number) {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, bytes * 8));
}

/** RFC 8291 — ব্রাউজারের p256dh আর auth দিয়ে বার্তা এনক্রিপ্ট (একটা রেকর্ড) */
export async function encryptPayload(p256dh: string, auth: string, plaintext: string): Promise<Uint8Array> {
  const uaPublic = unb64u(p256dh);
  const authSecret = unb64u(auth);
  const local = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair;
  const asPublic = new Uint8Array((await crypto.subtle.exportKey("raw", local.publicKey)) as ArrayBuffer);
  const uaKey = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey } as never, local.privateKey, 256));
  const ikm = await hkdf(authSecret, shared, concat(enc.encode("WebPush: info\0"), uaPublic, asPublic), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);
  const aes = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aes, concat(enc.encode(plaintext), new Uint8Array([2]))));
  const rs = new Uint8Array([0, 0, 0x10, 0]); // 4096
  return concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, cipher);
}

export type PushSub = { id: number; endpoint: string; p256dh: string; auth: string };
export type PushMessage = { title: string; body: string; url: string; tag?: string };

/** এক দোকানের সব সাবস্ক্রিপশনে পাঠানো; বাতিল (৪০৪/৪১০) গুলো মুছে ফেলা */
export async function pushToShop(db: D1Database, platformDb: D1Database, msg: PushMessage): Promise<number> {
  const { results } = await db.prepare("SELECT id, endpoint, p256dh, auth FROM push_subs ORDER BY id DESC LIMIT 20").all<PushSub>();
  if (!results.length) return 0;
  const v = await vapidKeys(platformDb);
  const body = JSON.stringify(msg);
  let sent = 0;
  await Promise.all(results.map(async (s) => {
    try {
      const payload = await encryptPayload(s.p256dh, s.auth, body);
      const res = await fetch(s.endpoint, {
        method: "POST",
        headers: {
          Authorization: `vapid t=${await vapidJwt(v, s.endpoint)}, k=${v.publicKey}`,
          "Content-Encoding": "aes128gcm",
          "Content-Type": "application/octet-stream",
          TTL: "86400",
          Urgency: "high",
        },
        body: payload,
        signal: AbortSignal.timeout(10_000),
      });
      if (res.status === 404 || res.status === 410) await db.prepare("DELETE FROM push_subs WHERE id = ?").bind(s.id).run();
      else if (res.ok) sent++;
    } catch (e) {
      console.error("push error", e);
    }
  }));
  return sent;
}

/** ব্রাউজারের endpoint শুধু চেনা পুশ সার্ভিসের হলে (অন্য কোথাও অনুরোধ পাঠানো আটকাতে) */
export function allowedEndpoint(u: string): boolean {
  try {
    const url = new URL(u);
    return url.protocol === "https:" && /(^|\.)(googleapis\.com|mozilla\.com|mozaws\.net|push\.apple\.com|notify\.windows\.com)$/.test(url.hostname);
  } catch {
    return false;
  }
}
