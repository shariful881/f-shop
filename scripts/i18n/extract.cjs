// কোড থেকে বাংলা লেখা বের করা: string, template, JSX text (পাশের {expr} হলে {x})
const ts = require(require("path").join(__dirname, "../../node_modules/typescript"));
const fs = require("fs"), path = require("path");
const BN = /[ঀ-৿]/;
const ROOT = require("path").join(__dirname, "../..");
const files = process.argv.slice(2);
const out = new Map(); // key -> [file:line]
function norm(s) {
  return s.replace(/\s+/g, " ").trim().replace(/[0-9০-৯]+(?:[.,][0-9০-৯]+)*/g, "{n}");
}
function add(s, sf, node) {
  if (!BN.test(s)) return;
  const k = norm(s);
  if (!k) return;
  const loc = path.relative(ROOT, sf.fileName) + ":" + (sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1);
  if (!out.has(k)) out.set(k, []);
  if (out.get(k).length < 3) out.get(k).push(loc);
}
for (const f of files) {
  const src = fs.readFileSync(f, "utf8");
  const kind = f.endsWith(".tsx") ? ts.ScriptKind.TSX : f.endsWith(".js") ? ts.ScriptKind.JS : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(f, src, ts.ScriptTarget.Latest, true, kind);
  const visit = (n) => {
    if (ts.isJsxElement(n) || ts.isJsxFragment(n)) {
      // পাশাপাশি text + {expr} এক রানে
      let run = "", has = false, first = null;
      const flush = () => { if (has && run.trim()) add(run, sf, first); run = ""; has = false; first = null; };
      for (const ch of n.children) {
        if (ts.isJsxText(ch)) { run += ch.text; if (BN.test(ch.text)) has = true; first = first || ch; }
        else if (ts.isJsxExpression(ch) && ch.expression && !containsJsx(ch.expression)) {
          const e = ch.expression;
          if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) { run += e.text; if (BN.test(e.text)) has = true; }
          else run += "{x}";
          first = first || ch;
        } else flush();
      }
      flush();
    }
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) {
      if (!(n.parent && ts.isImportDeclaration(n.parent))) add(n.text, sf, n);
    } else if (ts.isTemplateExpression(n)) {
      let s = n.head.text;
      for (const sp of n.templateSpans) s += "{x}" + sp.literal.text;
      add(s, sf, n);
      // ভেতরের অংশগুলো আলাদা করেও (HTML-এর ভেতরে টেমপ্লেট হলে টুকরো আলাদা নোডে যায়)
      for (const part of [n.head.text, ...n.templateSpans.map((x) => x.literal.text)]) {
        for (const seg of part.split(/<[^>]*>/)) add(seg, sf, n);
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
}
function containsJsx(e) { let f = false; const v = (x) => { if (ts.isJsxElement(x) || ts.isJsxSelfClosingElement(x) || ts.isJsxFragment(x)) f = true; else ts.forEachChild(x, v); }; v(e); return f; }
const arr = [...out.entries()].map(([k, locs]) => ({ k, locs }));
fs.writeFileSync(process.env.OUT || "strings.json", JSON.stringify(arr, null, 1));
console.log(arr.length);
