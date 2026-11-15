import { ASSET_VERSION } from "../views/layout";

/**
 * সার্ভারে সমস্যা হলে ক্রেতা/দোকানদার যে পেজ দেখে — ডাটাবেস ছাড়াই চলে (সমস্যা ডাটাবেসেও হতে পারে)।
 */
export function errorPageHtml(kind: "shop" | "platform"): string {
  const css = kind === "shop" ? `/css/app.css?v=${ASSET_VERSION}` : `/css/platform.css?v=${ASSET_VERSION}`;
  return `<!DOCTYPE html><html lang="bn"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>একটু সমস্যা হয়েছে</title><link rel="stylesheet" href="${css}"><style>.err-box{max-width:460px;margin:12vh auto;padding:32px 24px;text-align:center;font-family:'Hind Siliguri',system-ui,sans-serif}.err-box h1{font-size:1.5rem;margin:0 0 10px}.err-box p{color:#555;line-height:1.7;margin:0 0 22px}.err-box a{display:inline-block;padding:10px 22px;border-radius:10px;background:#0f766e;color:#fff;text-decoration:none;font-weight:600}</style></head><body><main class="err-box"><h1>দুঃখিত, একটু সমস্যা হয়েছে</h1><p>পেজটা এই মুহূর্তে খোলা যাচ্ছে না। আমরা খবর পেয়ে গেছি — একটু পরে আবার চেষ্টা করুন।</p><a href="/">হোম পেজে ফিরুন</a></main></body></html>`;
}
