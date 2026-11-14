import type { Ctx } from "../env";

/** JSX → পূর্ণ HTML পেজ */
export function page(c: Ctx, node: unknown, status: 200 | 404 | 422 | 429 | 403 = 200) {
  c.header("Cache-Control", "no-store");
  return c.html("<!DOCTYPE html>" + String(node), status);
}
