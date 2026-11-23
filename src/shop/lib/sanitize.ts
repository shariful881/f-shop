/**
 * দোকানদার/স্টাফের দেওয়া HTML নিরাপদ করা (allowlist)।
 * script, style, iframe, onClick ইত্যাদি সরিয়ে দেয়; শুধু সাধারণ লেখার ট্যাগ রাখে।
 */
const ALLOWED: Record<string, string[]> = {
  p: ["style"], br: [], hr: [], strong: [], b: [], em: [], i: [], u: [], s: [], strike: [], small: [], mark: [], code: [], pre: [],
  h1: ["style"], h2: ["style"], h3: ["style"], h4: ["style"], ul: [], ol: [], li: ["style"], blockquote: ["style"], div: ["style"], span: [],
  table: [], thead: [], tbody: [], tr: [], th: ["style"], td: ["style"],
  a: ["href", "title", "target"],
  img: ["src", "alt", "width", "height"],
};
const VOID = new Set(["br", "hr", "img"]);

function esc(s: string): string {
  return s.replace(/&(?!(?:[a-z]+|#\d+|#x[0-9a-f]+);)/gi, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function safeUrl(u: string): string | null {
  const v = u.trim().replace(/[\u0000-\u001f\s]+/g, "");
  if (/^(https?:\/\/|\/(?!\/)|#|mailto:|tel:)/i.test(v)) return v;
  if (/^[a-z0-9._-]+(\/|$)/i.test(v) && !/^[a-z]+:/i.test(v)) return v;
  return null;
}

export function sanitizeHtml(input: string | null | undefined): string {
  if (!input) return "";
  let html = String(input).slice(0, 200_000);
  html = html.replace(/<!--[\s\S]*?-->/g, "");
  html = html.replace(/<(script|style|iframe|object|embed|noscript|template|svg|math)\b[\s\S]*?<\/\1\s*>/gi, "");
  html = html.replace(/<(script|style|iframe|object|embed|noscript|template|svg|math)\b[^>]*>/gi, "");
  return html
    .split(/(<[^>]*>)/)
    .map((part) => {
      const plain = () => part.replace(/</g, "&lt;").replace(/>/g, "&gt;");
      if (!part.startsWith("<") || !part.endsWith(">")) return plain();
      const m = part.match(/^<(\/?)([a-z][a-z0-9]*)(\s[\s\S]*?)?\s*\/?>$/i);
      if (!m) return plain();
      const closing = m[1] === "/";
      const tag = m[2]!.toLowerCase();
      const allowed = ALLOWED[tag];
      if (!allowed) return "";
      if (closing) return VOID.has(tag) ? "" : `</${tag}>`;
      const attrs: string[] = [];
      const re = /([a-z-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/gi;
      let a: RegExpExecArray | null;
      while ((a = re.exec(m[3] ?? ""))) {
        const name = a[1]!.toLowerCase();
        if (!allowed.includes(name)) continue;
        let val = a[3] ?? a[4] ?? a[5] ?? "";
        if (name === "href" || name === "src") {
          const u = safeUrl(val);
          if (!u) continue;
          val = u;
        }
        if (name === "target") val = "_blank";
        // style থেকে শুধু লেখার দিক (বাঁয়ে/মাঝে/ডানে) রাখা হয়
        if (name === "style") {
          const al = /(?:^|;)\s*text-align\s*:\s*(left|center|right|justify)\s*(?:;|$)/i.exec(val);
          if (!al) continue;
          val = `text-align:${al[1]!.toLowerCase()}`;
        }
        attrs.push(`${name}="${esc(val)}"`);
      }
      if (tag === "a" && attrs.some((x) => x.startsWith("target="))) attrs.push('rel="noopener noreferrer"');
      if (tag === "img") attrs.push('loading="lazy"');
      return `<${tag}${attrs.length ? " " + attrs.join(" ") : ""}>`;
    })
    .join("");
}
