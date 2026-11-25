import { sha256Hex } from "../shop/lib/auth";
import { phoneE164Digits } from "../shop/lib/phone";

/**
 * SellxBD-এর নিজের Facebook Pixel + Conversions API (দোকানের Pixel থেকে আলাদা)।
 * চাবি থাকে platform_settings-এ: fb_px_id, fb_px_token, fb_px_test (Test Events কোড)।
 * ব্রাউজার আর সার্ভার একই event_id পাঠায়, তাই Facebook একবারই গোনে।
 */
export type PxSettings = Record<string, string>;

export const pxId = (ps: PxSettings) => (/^\d{6,20}$/.test(ps.fb_px_id || "") ? ps.fb_px_id! : "");
export const pxReady = (ps: PxSettings) => !!pxId(ps) && !!(ps.fb_px_token || "").trim();

/** ব্রাউজার থেকে যেসব ইভেন্ট সার্ভারে মেলানো যায় (বাকিগুলো শুধু সার্ভারই পাঠায়) */
export const BROWSER_EVENTS = new Set(["PageView", "ViewContent", "Contact", "Lead"]);
export const okEventId = (id: unknown): id is string => typeof id === "string" && /^[A-Za-z0-9_-]{6,80}$/.test(id);
export const newPxId = (p: string) => `${p}_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;

export type PxUser = {
  ip?: string | null;
  ua?: string | null;
  fbp?: string | null;
  fbc?: string | null;
  phone?: string | null;
  email?: string | null;
  /** দোকানের id — সব ইভেন্টে একই মানুষ চেনাতে */
  externalId?: string | null;
};

/** দোকান খোলার সময়ের ব্রাউজার তথ্য (shops.ad_click) */
export type AdClick = { fbp?: string; fbc?: string; ua?: string; ip?: string; url?: string };

export function cookieVal(header: string | null | undefined, name: string): string | null {
  const m = (header || "").match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  const v = m?.[1] ? decodeURIComponent(m[1]) : "";
  return /^fb\.\d\.\d+\.[\w.-]{4,200}$/.test(v) ? v : null;
}

/** কুকি না থাকলেও অ্যাড-ক্লিকের fbclid থেকে fbc বানানো */
export function fbcFrom(cookie: string | null, url: string | null | undefined): string | null {
  if (cookie) return cookie;
  try {
    const id = url ? new URL(url).searchParams.get("fbclid") : null;
    return id && /^[\w-]{8,300}$/.test(id) ? `fb.1.${Date.now()}.${id}` : null;
  } catch {
    return null;
  }
}

export async function pxUserData(u: PxUser) {
  const d: Record<string, unknown> = { country: [await sha256Hex("bd")] };
  if (u.ip) d.client_ip_address = u.ip;
  if (u.ua) d.client_user_agent = u.ua;
  if (u.fbp) d.fbp = u.fbp;
  if (u.fbc) d.fbc = u.fbc;
  if (u.phone) d.ph = [await sha256Hex(phoneE164Digits(u.phone))];
  if (u.email) d.em = [await sha256Hex(u.email.trim().toLowerCase())];
  if (u.externalId) d.external_id = [await sha256Hex(u.externalId)];
  return d;
}

export type PxEvent = { name: string; id: string; url: string; user: PxUser; custom?: Record<string, unknown>; time?: number };

export async function pxSend(ps: PxSettings, events: PxEvent[]): Promise<{ ok: boolean; status: number; body: string }> {
  if (!pxReady(ps) || !events.length) return { ok: false, status: 0, body: "Pixel/টোকেন নেই" };
  const data = await Promise.all(events.map(async (e) => ({
    event_name: e.name,
    event_time: e.time ?? Math.floor(Date.now() / 1000),
    event_id: e.id,
    action_source: "website",
    event_source_url: e.url,
    user_data: await pxUserData(e.user),
    ...(e.custom ? { custom_data: e.custom } : {}),
  })));
  const payload: Record<string, unknown> = { data, access_token: ps.fb_px_token!.trim() };
  if ((ps.fb_px_test || "").trim()) payload.test_event_code = ps.fb_px_test!.trim();
  try {
    const res = await fetch(`https://graph.facebook.com/v26.0/${pxId(ps)}/events`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });
    const body = (await res.text()).slice(0, 1000);
    if (!res.ok) console.warn("SellxBD CAPI ব্যর্থ:", res.status, body);
    return { ok: res.ok, status: res.status, body };
  } catch (e) {
    console.warn("SellxBD CAPI error", e);
    return { ok: false, status: 0, body: (e as Error).message };
  }
}

/** রেসপন্স আটকে না রেখে পাঠানো */
export function pxLater(ctx: { waitUntil(p: Promise<unknown>): void } | undefined, ps: PxSettings, events: PxEvent[]) {
  if (!pxReady(ps)) return;
  const job = pxSend(ps, events).catch(() => {});
  try {
    ctx ? ctx.waitUntil(job) : void job;
  } catch {
    void job;
  }
}

/** দোকানের সংরক্ষিত তথ্য থেকে ইউজার (রিচার্জ অনুমোদন — দোকানদার তখন ব্রাউজারে নেই) */
export function shopPxUser(shop: { id: string; owner_phone?: string | null; owner_email?: string | null; ad_click?: string | null }, now?: PxUser): PxUser {
  let a: AdClick = {};
  try { a = shop.ad_click ? JSON.parse(shop.ad_click) : {}; } catch {}
  return {
    ip: now?.ip ?? a.ip ?? null,
    ua: now?.ua ?? a.ua ?? null,
    fbp: now?.fbp ?? a.fbp ?? null,
    fbc: now?.fbc ?? a.fbc ?? null,
    phone: shop.owner_phone ?? null,
    email: shop.owner_email ?? null,
    externalId: shop.id,
  };
}

const js = (v: unknown) => JSON.stringify(v).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");

/**
 * মূল সাইটের পাবলিক পেজের Pixel: PageView, ViewContent (দাম/ডেমো), Contact (WhatsApp/ফোন), Lead (সাইনআপ ফর্ম শুরু)।
 * প্রতিটা ইভেন্ট /px-এ পাঠানো হয় যাতে সার্ভার একই event_id দিয়ে Conversions API-তে পাঠায়।
 */
export function pxBrowserScript(id: string): string {
  return `<script>
!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('init',${js(id)});
(function(){
  function eid(n){return n+'_'+Date.now().toString(36)+Math.random().toString(36).slice(2,10);}
  function T(n,p){var id=eid(n);p=p||{};fbq('track',n,p,{eventID:id});
    try{var d=JSON.stringify({n:n,id:id,p:p,u:location.href});
      if(!(navigator.sendBeacon&&navigator.sendBeacon('/px',new Blob([d],{type:'application/json'}))))fetch('/px',{method:'POST',body:d,headers:{'content-type':'application/json'},keepalive:true});
    }catch(x){}}
  window.sxTrack=T;
  T('PageView');
  var path=location.pathname, seen={};
  function vc(name){if(seen[name])return;seen[name]=1;T('ViewContent',{content_name:name,content_category:'sellxbd'});}
  if(path==='/pricing')vc('pricing');
  if(path.indexOf('/help/')===0||path.indexOf('/blog/')===0)vc(path.split('/')[1]);
  document.addEventListener('DOMContentLoaded',function(){
    var pr=document.querySelector('#price,#pricing,[data-px-pricing]');
    if(pr&&'IntersectionObserver' in window){var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){vc('pricing');io.disconnect();}});},{threshold:.3});io.observe(pr);}
    var f=document.querySelector('form[action="/signup"]');
    if(f){var led=false;f.addEventListener('input',function(){if(led)return;led=true;
      try{if(sessionStorage.getItem('sx_lead'))return;sessionStorage.setItem('sx_lead','1');}catch(x){}
      T('Lead',{content_name:'signup'});},true);}
  });
  document.addEventListener('click',function(ev){
    var a=ev.target&&ev.target.closest&&ev.target.closest('a[href]');if(!a)return;var h=a.getAttribute('href')||'';
    if(/^tel:|wa\\.me|whatsapp\\.com|m\\.me\\//i.test(h))T('Contact',{content_name:/^tel:/.test(h)?'phone':'whatsapp'});
    else if(/demo/i.test(h)||a.hasAttribute('data-px-demo'))vc('demo');
  },true);
})();
</script>`;
}

/** সাইনআপ শেষে: ব্রাউজারেও একই event_id দিয়ে StartTrial, তারপর দোকানের অ্যাডমিনে */
export function pxSignupDonePage(id: string, externalId: string, evs: { name: string; id: string; params: Record<string, unknown> }[], to: string): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  return `<!DOCTYPE html><html lang="bn"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>দোকান তৈরি হচ্ছে…</title><meta http-equiv="refresh" content="3;url=${esc(to)}">
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:"Hind Siliguri",system-ui,sans-serif;background:#f0fdfa;color:#0f766e}
.b{text-align:center}.s{width:42px;height:42px;border:4px solid #99f6e4;border-top-color:#0f766e;border-radius:50%;margin:0 auto 14px;animation:r 0.8s linear infinite}@keyframes r{to{transform:rotate(360deg)}}a{color:#0f766e}</style>
<script>
!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('init',${js(id)},{external_id:${js(externalId)}});
${js(evs)}.forEach(function(e){fbq('track',e.name,e.params,{eventID:e.id});});
setTimeout(function(){location.replace(${js(to)});},900);
</script></head><body><div class="b"><div class="s"></div><p>আপনার দোকান তৈরি হয়েছে — নিয়ে যাচ্ছি…</p><p><small><a href="${esc(to)}">না গেলে এখানে চাপুন</a></small></p></div></body></html>`;
}
