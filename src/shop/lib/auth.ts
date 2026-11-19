/**
 * পাসওয়ার্ড hash (PBKDF2-SHA256) আর অ্যাডমিন সেশন।
 * hash-এর ফরম্যাট: pbkdf2_sha256$<iterations>$<salt base64>$<hash base64>
 * scripts/admin-create.mjs একই ফরম্যাটে Node দিয়ে hash বানায়।
 */
const enc = new TextEncoder();

function b64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
function unb64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  return crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
}

/**
 * ১,০০,০০০ বার (Workers Paid — প্রতি লগইনে ~১২ms CPU)। Cloudflare-এর PBKDF2 এর বেশি নিশ্চিতভাবে চলে না।
 * পুরনো ২০,০০০-এর hash লগইনের সময় নিজে নতুন করে বানানো হয় (needsRehash) — কাউকে কিছু করতে হয় না।
 */
export const PASSWORD_ITERATIONS = 100_000;

/** পুরনো (কম বারের) hash — সঠিক পাসওয়ার্ডে লগইনের পর নতুন করে বানানো উচিত */
export function needsRehash(stored: string): boolean {
  const iter = parseInt(stored.split("$")[1] ?? "", 10);
  return !(iter >= PASSWORD_ITERATIONS);
}

export async function hashPassword(password: string, iterations = PASSWORD_ITERATIONS): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, iterations);
  return `pbkdf2_sha256$${iterations}$${b64(salt)}$${b64(hash)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, iter, salt, hash] = stored.split("$");
  if (algo !== "pbkdf2_sha256" || !iter || !salt || !hash) return false;
  const iterations = parseInt(iter, 10);
  if (!(iterations > 0 && iterations <= 100_000)) return false;
  const actual = new Uint8Array(await pbkdf2(password, unb64(salt), iterations));
  const expected = unb64(hash);
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual[i]! ^ expected[i]!;
  return diff === 0;
}

export async function sha256Hex(input: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", enc.encode(input));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const SESSION_DAYS = 7;

export async function createSession(db: D1Database, userId: number): Promise<string> {
  const token = [...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, "0")).join("");
  await db
    .prepare(`INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, datetime('now', '+${SESSION_DAYS} days'))`)
    .bind(await sha256Hex(token), userId)
    .run();
  return token;
}

export async function sessionUser(db: D1Database, token: string | undefined) {
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return null;
  return db
    .prepare(
      `SELECT u.id, u.email, u.name, u.role FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.id = ? AND s.expires_at > datetime('now') AND u.is_admin = 1 AND u.active = 1`,
    )
    .bind(await sha256Hex(token))
    .first<{ id: number; email: string; name: string; role: Role }>();
}

/** এই ইউজারের বাকি সব সেশন মোছা (এখনকারটা রেখে) — ফেরত: কয়টা মুছল */
export async function destroyOtherSessions(db: D1Database, userId: number, keepToken: string | undefined): Promise<number> {
  const keep = keepToken && /^[0-9a-f]{64}$/.test(keepToken) ? await sha256Hex(keepToken) : "";
  const r = await db.prepare("DELETE FROM sessions WHERE user_id = ? AND id != ?").bind(userId, keep).run();
  return r.meta?.changes ?? 0;
}

export async function destroySession(db: D1Database, token: string | undefined) {
  if (!token) return;
  await db.prepare("DELETE FROM sessions WHERE id = ?").bind(await sha256Hex(token)).run();
}

/* ---------- রোল ও অনুমতি ---------- */
export type Role = "owner" | "manager" | "orders";

export const ROLE_LABEL: Record<Role, string> = {
  owner: "মালিক",
  manager: "ম্যানেজার",
  orders: "অর্ডার স্টাফ",
};

/** কোন পেজ কে দেখতে পারবে */
export const SECTION_ROLES: Record<string, Role[]> = {
  orders: ["owner", "manager", "orders"],
  account: ["owner", "manager", "orders"],
  customers: ["owner", "manager", "orders"],
  incomplete: ["owner", "manager", "orders"],
  "fraud-check": ["owner", "manager", "orders"],
  "fraud-report": ["owner", "manager", "orders"],
  push: ["owner", "manager", "orders"],
  export: ["owner", "manager"],
  products: ["owner", "manager"],
  inventory: ["owner", "manager"],
  landing: ["owner", "manager"],
  pages: ["owner", "manager"],
  "upload-image": ["owner", "manager"],
  media: ["owner", "manager"],
  categories: ["owner", "manager"],
  blacklist: ["owner", "manager"],
  coupons: ["owner", "manager"],
  ads: ["owner", "manager"],
  reports: ["owner", "manager"],
  profit: ["owner", "manager"],
  reviews: ["owner", "manager"],
  settings: ["owner"],
  design: ["owner"],
  support: ["owner", "manager", "orders"],
  courier: ["owner"],
  sms: ["owner"],
  billing: ["owner"],
  staff: ["owner"],
  domains: ["owner"],
  domain: ["owner"],
  dns: ["owner"],
};

export function canAccess(role: Role, section: string): boolean {
  const roles = SECTION_ROLES[section];
  return roles ? roles.includes(role) : role === "owner";
}
