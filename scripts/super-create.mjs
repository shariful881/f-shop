#!/usr/bin/env node
/**
 * সুপার অ্যাডমিন বানানো (বা পাসওয়ার্ড বদলানো):
 *   npm run super:create -- email@example.com            → লোকাল/Codespaces
 *   npm run super:create -- email@example.com --remote   → লাইভ (Cloudflare)
 */
import { pbkdf2Sync, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import readline from "node:readline";

const args = process.argv.slice(2);
const remote = args.includes("--remote");
const email = (args.find((a) => !a.startsWith("--")) || "").trim().toLowerCase();
if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(email)) {
  console.error("ব্যবহার: npm run super:create -- email@example.com [--remote]");
  process.exit(1);
}

function askHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => {
      if (s.includes(question)) rl.output.write(s);
      else if (s.includes("\n") || s.includes("\r")) rl.output.write("\n");
      else rl.output.write("*");
    };
    rl.question(question, (a) => { rl.close(); resolve(a); });
  });
}

let password = process.env.ADMIN_PASSWORD;
if (!password) {
  password = await askHidden("পাসওয়ার্ড: ");
  if (password !== (await askHidden("আবার পাসওয়ার্ড: "))) { console.error("দুটো পাসওয়ার্ড মেলেনি।"); process.exit(1); }
}
if (password.length < 10) { console.error("সুপার অ্যাডমিনের পাসওয়ার্ড কমপক্ষে ১০ অক্ষরের হতে হবে।"); process.exit(1); }

const salt = randomBytes(16);
const hash = pbkdf2Sync(password, salt, 20000, 32, "sha256");
const stored = `pbkdf2_sha256$20000$${salt.toString("base64")}$${hash.toString("base64")}`;
const sql = `INSERT INTO super_admins (email, password_hash) VALUES ('${email}', '${stored}') ON CONFLICT(email) DO UPDATE SET password_hash = excluded.password_hash;`;
try {
  execFileSync("npx", ["wrangler", "d1", "execute", "PLATFORM_DB", remote ? "--remote" : "--local", "--command", sql], { stdio: ["inherit", "ignore", "inherit"] });
  console.log(`\n✓ সুপার অ্যাডমিন তৈরি: ${email} (${remote ? "লাইভ" : "লোকাল"})  →  লগইন: /super`);
} catch {
  console.error("\nডাটাবেসে লেখা যায়নি। আগে `npm run db:migrate` চালিয়েছেন কি না দেখুন।");
  process.exit(1);
}
