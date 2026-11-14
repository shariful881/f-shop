/**
 * অ্যাডমিনের ছোট কম্পোনেন্ট — ui.css-এর ক্লাসগুলো এক জায়গা থেকে।
 * নতুন পেজ বা পুরনো পেজ নতুন করে সাজাতে এগুলো ব্যবহার করুন, যাতে সব পেজ একরকম দেখায়।
 */
import type { Child } from "hono/jsx";
import { Icon, type IconName } from "./icons";

/** পেজের মাথা: শিরোনাম, ছোট বর্ণনা, ডানে কাজের বাটন */
export const PageHead = (p: { title: Child; desc?: Child; actions?: Child }) => (
  <div class="page-head">
    <div>
      <h1>{p.title}</h1>
      {p.desc && <p>{p.desc}</p>}
    </div>
    {p.actions && <div class="actions">{p.actions}</div>}
  </div>
);

/** কিছু না থাকলে: আইকন, এক লাইন, পরের কাজের বাটন */
export const EmptyState = (p: { icon: IconName; title: Child; text?: Child; action?: Child }) => (
  <div class="empty-state">
    <Icon name={p.icon} />
    <h3>{p.title}</h3>
    {p.text && <p>{p.text}</p>}
    {p.action}
  </div>
);

/** স্ট্যাটাস ব্যাজ */
export const Badge = (p: { tone?: "ok" | "bad" | "warn" | "info"; children?: Child }) => (
  <span class={`badge${p.tone ? ` badge-${p.tone}` : ""}`}>{p.children}</span>
);

/** কার্ড, চাইলে শিরোনাম আর ডানে লিংক/বাটন */
export const Card = (p: { title?: Child; action?: Child; children?: Child }) => (
  <section class="sa-card">
    {(p.title || p.action) && (
      <div class="sa-card-head">
        {p.title && <h2>{p.title}</h2>}
        {p.action}
      </div>
    )}
    {p.children}
  </section>
);
