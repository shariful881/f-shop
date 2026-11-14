import { env } from "cloudflare:test";
// @ts-expect-error — Vite ?raw import
import seedSql from "../scripts/seed-demo.sql?raw";

/** scripts/seed-demo.sql চালায় (DemoSeeder) */
export async function seedDemo() {
  const statements = (seedSql as string)
    .split("\n")
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
  await env.DB.batch(statements.map((s) => env.DB.prepare(s)));
}
