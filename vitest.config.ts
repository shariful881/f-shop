import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig(async () => {
  const migrations = await readD1Migrations("./migrations/platform");
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: "./wrangler.jsonc" },
        miniflare: { bindings: { TEST_MIGRATIONS: migrations, DEV_MODE: "0", CF_API_TOKEN: "test-token", CF_ACCOUNT_ID: "acc1" } },
      }),
    ],
    test: {
      setupFiles: ["./test/setup.ts"],
    },
  };
});
