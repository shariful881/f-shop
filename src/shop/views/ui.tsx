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

/** সব কম্পোনেন্ট এক পাতায় (/admin/ui-kit, শুধু মালিক) — নতুন পেজ বানানোর সময় এখান থেকে দেখে নেওয়া */
export const UiKitPage = () => (
  <>
    <PageHead title="ডিজাইন কম্পোনেন্ট" desc="অ্যাডমিনের সব পেজ এই একই বাটন, ঘর, কার্ড, টেবিল আর ব্যাজ দিয়ে বানানো।" actions={<a class="btn btn-primary" href="#">প্রধান বাটন</a>} />
    <Card title="বাটন">
      <p class="uk-row"><button class="btn btn-primary">প্রধান</button> <button class="btn">সাধারণ</button> <button class="btn btn-outline">আউটলাইন</button> <button class="btn btn-danger">মুছুন</button> <button class="btn btn-sm">ছোট</button> <a class="btn-link" href="#">লিংকের মতো</a></p>
    </Card>
    <Card title="ঘর (ফর্ম)">
      <div class="uk-grid">
        <label class="field"><span>নাম</span><input type="text" placeholder="যেমন: রহিম" /></label>
        <label class="field"><span>ক্যাটাগরি</span><select><option>থ্রি-পিস</option><option>শাড়ি</option></select></label>
        <label class="field"><span>বিবরণ</span><textarea rows={2} placeholder="ছোট বিবরণ"></textarea></label>
        <label class="check"><input type="checkbox" checked /> হোমে দেখান</label>
      </div>
    </Card>
    <Card title="ব্যাজ আর বার্তা">
      <p class="uk-row"><Badge tone="ok">কনফার্ম</Badge> <Badge tone="warn">অপেক্ষায়</Badge> <Badge tone="bad">ফেক</Badge> <Badge tone="info">শিপড</Badge> <Badge>নতুন</Badge></p>
      <div class="alert alert-ok">সেভ হয়েছে।</div>
      <div class="alert alert-error">ফোন নম্বর ঠিক নয়।</div>
      <form method="get" action="/admin/ui-kit" data-confirm="এটা একটা নমুনা পপআপ। চালিয়ে যাবেন?"><button class="btn">নিশ্চিত করার পপআপ দেখুন</button></form>
    </Card>
    <Card title="টেবিল">
      <div class="table-wrap"><table class="table"><thead><tr><th>অর্ডার</th><th>কাস্টমার</th><th>মোট</th><th>অবস্থা</th></tr></thead>
        <tbody><tr><td>#১০২৪</td><td>রহিম উদ্দিন</td><td>৳১,২৫০</td><td><Badge tone="ok">কনফার্ম</Badge></td></tr><tr><td>#১০২৩</td><td>করিম</td><td>৳৮৫০</td><td><Badge>নতুন</Badge></td></tr></tbody></table></div>
    </Card>
    <EmptyState icon="package" title="এখনো কিছু নেই" text="খালি অবস্থায় এমন দেখায় — সাথে পরের কাজের বাটন।" action={<a class="btn btn-primary" href="#">শুরু করুন</a>} />
  </>
);
