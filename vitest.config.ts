import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig(async () => {
  const migrations = await readD1Migrations("./migrations/platform");
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: "./wrangler.jsonc" },
        // AI-এর মতো রিমোট বাইন্ডিং টেস্টে চালু হয় না (টেস্টে AI-এর উত্তর নকল করা হয়)
        remoteBindings: false,
        miniflare: { bindings: { TEST_MIGRATIONS: migrations, DEV_MODE: "0", PLATFORM_DOMAIN: "ourdomain.com", CF_API_TOKEN: "test-token", CF_ACCOUNT_ID: "acc1", PORKBUN_API_KEY: "pk1_sb_test", PORKBUN_SECRET_KEY: "sk1_sb_test" } },
      }),
    ],
    test: {
      setupFiles: ["./test/setup.ts"],
    },
  };
});
