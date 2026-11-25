/**
 * SellxBD-এর সব ইমেইলের এক নকশা — Gmail/Outlook/ফোনের মেইল অ্যাপে ঠিক দেখাতে
 * টেবিল আর inline style (ইমেইলে বাইরের CSS/ফন্ট/SVG চলে না)।
 * ৬০০px পর্যন্ত চওড়া, ফোনে পুরো চওড়া; বোতাম আঙুলে চাপার মতো বড়।
 */

export type EmailParts = {
  lang: "bn" | "en";
  /** ইনবক্সে বিষয়ের পাশে ধূসর ছোট লেখা */
  preheader: string;
  /** কার্ডের উপরে বড় শিরোনাম */
  title: string;
  /** শিরোনামের উপরে ছোট রঙিন চিপ (যেমন "ইমেইল যাচাই") */
  badge: string;
  greeting: string;
  /** মূল কথা — HTML (আগেই নিরাপদ করা) */
  intro: string;
  /** দোকানের নাম বা অন্য তথ্যের সারি — [লেবেল, মান] */
  facts?: [string, string][];
  button: { label: string; url: string };
  /** বোতামের নিচে সময়সীমা (যেমন "২ দিন কাজ করবে") */
  expiry?: string;
  /** নিচের ধূসর নিরাপত্তা বার্তা */
  safety: string;
  supportPhone?: string;
  siteUrl: string;
};

const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]!);

const FONT = "'Hind Siliguri','Noto Sans Bengali','Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const TEAL = "#0f766e";
const TEAL_DARK = "#0b3b37";
const ORANGE = "#ea580c";

export function emailHtml(p: EmailParts): string {
  const bn = p.lang === "bn";
  const L = bn
    ? { fallback: "বাটন কাজ না করলে নিচের লিংকটা কপি করে ব্রাউজারে খুলুন:", help: "সাহায্য লাগলে", call: "কল বা WhatsApp", auto: "এটা একটা স্বয়ংক্রিয় ইমেইল — উত্তর দেওয়ার দরকার নেই।", tag: "বাংলাদেশের ই-কমার্স অটোমেশন" }
    : { fallback: "If the button doesn't work, copy this link into your browser:", help: "Need help?", call: "Call or WhatsApp", auto: "This is an automated email — no need to reply.", tag: "E-commerce automation for Bangladesh" };
  const url = esc(p.button.url);
  const rows = p.facts ?? [];
  const facts = rows.map(([k, v], i) =>
    `<tr><td style="padding:10px 14px;font-size:13px;color:#64748b;${i < rows.length - 1 ? "border-bottom:1px solid #e2e8f0;" : ""}white-space:nowrap;">${esc(k)}</td><td style="padding:10px 14px;font-size:15px;color:#0f172a;font-weight:700;${i < rows.length - 1 ? "border-bottom:1px solid #e2e8f0;" : ""}text-align:right;word-break:break-word;">${esc(v)}</td></tr>`,
  ).join("");
  const support = p.supportPhone
    ? `${L.help} — ${L.call}: <a href="tel:${esc(p.supportPhone)}" style="color:${TEAL};text-decoration:none;font-weight:700;">${esc(p.supportPhone)}</a>`
    : "";
  const site = esc(p.siteUrl.replace(/\/+$/, ""));

  return `<!DOCTYPE html>
<html lang="${p.lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light"><title>${esc(p.title)}</title>
<style>
@media only screen and (max-width:620px){
  .sx-wrap{padding:12px 8px !important}
  .sx-card{border-radius:14px !important}
  .sx-pad{padding:24px 20px !important}
  .sx-title{font-size:21px !important}
  .sx-btn a{display:block !important}
}
</style></head>
<body style="margin:0;padding:0;background:#eef2f1;-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${esc(p.preheader)}&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#eef2f1;">
<tr><td align="center" class="sx-wrap" style="padding:28px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;">

  <!-- লোগো -->
  <tr><td align="center" style="padding:4px 0 18px;font-family:${FONT};">
    <a href="${site}" style="text-decoration:none;">
      <span style="display:inline-block;width:34px;height:34px;line-height:34px;border-radius:10px;background:${TEAL};color:#fff;font-weight:800;font-size:18px;text-align:center;vertical-align:middle;">S</span>
      <span style="font-size:22px;font-weight:800;color:${TEAL_DARK};vertical-align:middle;letter-spacing:-.3px;">&nbsp;Sell<span style="color:${ORANGE};">x</span>BD</span>
    </a>
  </td></tr>

  <!-- কার্ড -->
  <tr><td class="sx-card" style="background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 6px 24px rgba(15,23,42,.08);">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr><td style="height:6px;line-height:6px;font-size:0;background:${TEAL};background-image:linear-gradient(90deg,${TEAL},#14b8a6 70%,${ORANGE});">&nbsp;</td></tr>
      <tr><td class="sx-pad" style="padding:34px 40px 30px;font-family:${FONT};color:#0f172a;">
        <span style="display:inline-block;background:#ccfbf1;color:${TEAL_DARK};font-size:12px;font-weight:700;padding:5px 12px;border-radius:999px;">${esc(p.badge)}</span>
        <h1 class="sx-title" style="margin:14px 0 18px;font-size:24px;line-height:1.35;font-weight:800;color:#0f172a;">${esc(p.title)}</h1>
        <p style="margin:0 0 10px;font-size:16px;line-height:1.7;color:#334155;">${esc(p.greeting)}</p>
        <p style="margin:0 0 22px;font-size:16px;line-height:1.7;color:#334155;">${p.intro}</p>
        ${facts ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;border-collapse:separate;margin:0 0 26px;">${facts}</table>` : ""}

        <!-- বোতাম -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" class="sx-btn">
          <a href="${url}" target="_blank" style="display:inline-block;background:${TEAL};color:#ffffff;font-family:${FONT};font-size:17px;font-weight:700;line-height:1;text-decoration:none;padding:17px 38px;border-radius:12px;box-shadow:0 4px 12px rgba(15,118,110,.3);">${esc(p.button.label)} &rarr;</a>
        </td></tr>
        ${p.expiry ? `<tr><td align="center" style="padding-top:12px;font-size:13px;color:#64748b;">&#9201; ${esc(p.expiry)}</td></tr>` : ""}
        </table>

        <!-- লিংক -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:26px;"><tr><td style="background:#f8fafc;border-radius:10px;padding:14px 16px;font-size:13px;line-height:1.6;color:#64748b;">
          ${L.fallback}<br><a href="${url}" style="color:${TEAL};word-break:break-all;">${url}</a>
        </td></tr></table>

        <!-- নিরাপত্তা -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:16px;"><tr><td style="border-left:3px solid #f59e0b;background:#fffbeb;border-radius:0 10px 10px 0;padding:12px 14px;font-size:13px;line-height:1.6;color:#78350f;">
          &#128274; ${esc(p.safety)}
        </td></tr></table>
      </td></tr>
    </table>
  </td></tr>

  <!-- ফুটার -->
  <tr><td align="center" style="padding:22px 16px 8px;font-family:${FONT};font-size:13px;line-height:1.8;color:#64748b;">
    ${support ? `${support}<br>` : ""}
    <a href="${site}" style="color:${TEAL_DARK};text-decoration:none;font-weight:700;">Sell<span style="color:${ORANGE};">x</span>BD</a> · ${L.tag}<br>
    <span style="font-size:12px;color:#94a3b8;">${L.auto}</span>
  </td></tr>

</table>
</td></tr></table>
</body></html>`;
}

/** একই কথার সাদা লেখা (HTML না দেখানো মেইল অ্যাপের জন্য) */
export function emailText(p: EmailParts, plainIntro: string): string {
  const lines = [p.greeting, "", plainIntro, ""];
  for (const [k, v] of p.facts ?? []) lines.push(`${k}: ${v}`);
  if (p.facts?.length) lines.push("");
  lines.push(`${p.button.label}: ${p.button.url}`);
  if (p.expiry) lines.push(p.expiry);
  lines.push("", p.safety, "");
  if (p.supportPhone) lines.push(`${p.lang === "bn" ? "সাহায্য" : "Help"}: ${p.supportPhone}`);
  lines.push("— SellxBD", p.siteUrl);
  return lines.join("\n");
}
