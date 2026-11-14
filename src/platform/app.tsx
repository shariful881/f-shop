import { Hono } from "hono";
import type { WorkerEnv } from "../worker-env";

/** প্ল্যাটফর্মের অ্যাপ: ourdomain.com (সাইনআপ, লগইন, সুপার অ্যাডমিন — পরের ধাপে) */
export const platformApp = new Hono<{ Bindings: WorkerEnv }>();

platformApp.get("/health", async (c) => {
  const row = await c.env.PLATFORM_DB.prepare("SELECT COUNT(*) AS n FROM shops").first<{ n: number }>();
  return c.json({ ok: true, shops: row?.n ?? 0 });
});

platformApp.get("/", (c) =>
  c.html(`<!DOCTYPE html><html lang="bn"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>F-Shop</title><link rel="stylesheet" href="/css/app.css"></head><body>
<main class="wrap narrow" style="padding:40px 14px;text-align:center">
<h1>F-Shop</h1><p>নিজের অনলাইন দোকান খুলুন কয়েক মিনিটে।</p>
<p class="muted">সাইনআপ শীঘ্রই আসছে।</p>
${c.env.DEV_MODE === "1" ? `<p><a class="btn btn-primary" href="/?shop=demoshop">ডেমো দোকান দেখুন</a></p>` : ""}
</main></body></html>`),
);

export const unknownHostPage = () =>
  new Response(
    `<!DOCTYPE html><html lang="bn"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>দোকান পাওয়া যায়নি</title><link rel="stylesheet" href="/css/app.css"></head>
<body><main class="wrap narrow empty"><h1>এই ঠিকানায় কোনো দোকান নেই</h1><p class="muted">ঠিকানাটি আবার দেখুন।</p></main></body></html>`,
    { status: 404, headers: { "content-type": "text/html; charset=utf-8" } },
  );
