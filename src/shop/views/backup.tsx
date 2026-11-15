/**
 * ব্যাকআপ ও স্টোরেজ — দোকানের ডাটা Excel/CSV-তে নামানো আর কতটা জায়গা খরচ হলো দেখা।
 */
import { bn } from "../lib/format";
import { MEDIA_SOFT_LIMIT, mb } from "../lib/media";
import { Icon } from "./icons";
import { Card, PageHead } from "./ui";

export type StorageStats = { products: number; orders: number; customers: number; images: number; imageBytes: number; pages: number; smsLogs: number };

const size = (n: number) => (n < 1024 * 1024 ? `${bn(Math.round(n / 1024))} KB` : `${bn(Number(mb(n)))} MB`);

const EXPORTS = [
  { kind: "orders", title: "সব অর্ডার", text: "অর্ডার নং, কাস্টমার, ঠিকানা, পণ্য, টাকা, অবস্থা, কুরিয়ার" },
  { kind: "products", title: "সব পণ্য", text: "নাম, দাম, কাটা দাম, ক্যাটাগরি, চালু আছে কিনা" },
  { kind: "customers", title: "কাস্টমার তালিকা", text: "মোবাইল, নাম, ঠিকানা, কতবার কিনেছে, মোট কেনা" },
];

export const BackupPage = (p: { stats: StorageStats }) => {
  const s = p.stats;
  const pct = Math.min(100, Math.round((s.imageBytes / MEDIA_SOFT_LIMIT) * 100));
  return (
    <>
      <PageHead title="ব্যাকআপ ও স্টোরেজ" desc="দোকানের ডাটা নিজের কম্পিউটারে রেখে দিন। ফাইলগুলো Excel বা Google Sheets-এ সরাসরি খোলে। মাসে অন্তত একবার নামিয়ে রাখা ভালো।" />

      <div class="backup-grid">
        {EXPORTS.map((e) => (
          <Card title={e.title}>
            <p class="muted">{e.text}</p>
            <a class="btn btn-primary" href={`/admin/export/${e.kind}.csv`} download><Icon name="download" size="sm" /> ডাউনলোড (CSV)</a>
          </Card>
        ))}
      </div>

      <Card title="জায়গা কতটা খরচ হলো">
        <div class="media-usage">
          <div><strong>ছবি: {size(s.imageBytes)}</strong> <small class="muted">(প্রস্তাবিত সীমা {bn(MEDIA_SOFT_LIMIT / 1024 / 1024)} MB)</small></div>
          <div class={`media-meter${pct >= 80 ? " warn" : ""}`}><i style={`width:${pct}%`}></i></div>
          {pct >= 80 && <small class="muted">জায়গা প্রায় শেষ — <a href="/admin/media?folder=unused">অব্যবহৃত ছবি</a> মুছে দিন।</small>}
        </div>
        <table class="table storage-table">
          <tbody>
            <tr><td>পণ্য</td><td>{bn(s.products)}টা</td></tr>
            <tr><td>অর্ডার</td><td>{bn(s.orders)}টা</td></tr>
            <tr><td>কাস্টমার</td><td>{bn(s.customers)} জন</td></tr>
            <tr><td>ছবি</td><td>{bn(s.images)}টা</td></tr>
            <tr><td>পেজ ও ল্যান্ডিং</td><td>{bn(s.pages)}টা</td></tr>
            <tr><td>SMS রেকর্ড</td><td>{bn(s.smsLogs)}টা</td></tr>
          </tbody>
        </table>
        <p class="muted small">ছবি আপলোডের সময় নিজে থেকেই ছোট করা হয়, তাই সাধারণ দোকানে জায়গার চিন্তা নেই। শুধু ছবির সংখ্যা অনেক বেশি হলে অব্যবহৃতগুলো মুছে দিন।</p>
      </Card>
    </>
  );
};
