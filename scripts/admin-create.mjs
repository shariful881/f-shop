#!/usr/bin/env node
/**
 * অ্যাডমিন বানানো (বা পাসওয়ার্ড বদলানো):
 *   npm run admin:create -- email@example.com            → লোকাল/Codespaces ডাটাবেসে
 *   npm run admin:create -- email@example.com --remote   → লাইভ (Cloudflare) ডাটাবেসে
 * পাসওয়ার্ড লুকানো ইনপুটে চাওয়া হবে।
 */
import { pbkdf2Sync, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import readline from "node:readline";

const args = process.argv.slice(2);
const remote = args.includes("--remote");
const email = (args.find((a) => !a.startsWith("--")) || "").trim().toLowerCase();

if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(email)) {
  console.error("ব্যবহার: npm run admin:create -- email@example.com [--remote]");
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
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

let password = process.env.ADMIN_PASSWORD;
if (!password) {
  password = await askHidden("পাসওয়ার্ড: ");
  const again = await askHidden("আবার পাসওয়ার্ড: ");
  if (password !== again) {
    console.error("দুটো পাসওয়ার্ড মেলেনি।");
    process.exit(1);
  }
}
if (password.length < 8) {
  console.error("পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের হতে হবে।");
  process.exit(1);
}

const iterations = 100000;
const salt = randomBytes(16);
const hash = pbkdf2Sync(password, salt, iterations, 32, "sha256");
const stored = `pbkdf2_sha256$${iterations}$${salt.toString("base64")}$${hash.toString("base64")}`;

const sql =
  `INSERT INTO users (name, email, password_hash, is_admin) VALUES ('Admin', '${email}', '${stored}', 1) ` +
  `ON CONFLICT(email) DO UPDATE SET password_hash = excluded.password_hash, is_admin = 1;`;

try {
  execFileSync("npx", ["wrangler", "d1", "execute", "DB", remote ? "--remote" : "--local", "--command", sql], {
    stdio: ["inherit", "ignore", "inherit"],
  });
  console.log(`\n✓ অ্যাডমিন তৈরি হয়েছে: ${email} (${remote ? "লাইভ" : "লোকাল"} ডাটাবেস)`);
  console.log("  লগইন: /admin");
} catch {
  console.error("\nডাটাবেসে লেখা যায়নি। আগে `npm run db:migrate` চালিয়েছেন কি না দেখুন।");
  process.exit(1);
}
