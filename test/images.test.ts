import { beforeEach, describe, expect, it } from "vitest";
import { runInDurableObject } from "cloudflare:test";
import { resetDb, shopStub } from "./helpers";
import { SqlImageStore } from "../src/shop/lib/images";
import { SqlDatabase } from "../src/shop/sql-adapter";
import type { ShopDO } from "../src/shop/shop-do";

beforeEach(resetDb);

describe("ছবি দোকানের নিজের ডাটাবেসে", () => {
  it("২MB-এর বড় ছবি টুকরো করে রাখে, হুবহু ফেরত দেয়, মুছে ফেলে", async () => {
    await runInDurableObject(shopStub(), async (_i: ShopDO, state) => {
      const store = new SqlImageStore(new SqlDatabase(state.storage));
      const data = new Uint8Array(2_700_000);
      for (let i = 0; i < data.length; i++) data[i] = (i * 31) % 251;
      await store.put("shops/x/products/big.jpg", data.buffer, { httpMetadata: { contentType: "image/jpeg" } });
      const chunks = state.storage.sql.exec("SELECT COUNT(*) n FROM image_chunks WHERE key = 'products/big.jpg'").one() as { n: number };
      expect(chunks.n).toBe(3);
      const got = await store.get("products/big.jpg");
      expect(got!.type).toBe("image/jpeg");
      expect(got!.body.byteLength).toBe(data.byteLength);
      expect(got!.body[2_699_999]).toBe(data[2_699_999]);
      expect(got!.body[1_048_576]).toBe(data[1_048_576]);
      await store.delete("products/big.jpg");
      expect(await store.get("products/big.jpg")).toBeNull();
    });
  });
});
