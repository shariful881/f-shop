import { storageLabel } from "../../platform/plans";
/**
 * স্টোরেজ — কতটা জায়গা খরচ হলো দেখা। (দোকান থেকে CSV ডাউনলোড বন্ধ — সুপার অ্যাডমিন নামিয়ে দেন)
 */
import { bn } from "../lib/format";
import { MEDIA_SOFT_LIMIT, mb } from "../lib/media";
import { Card, PageHead } from "./ui";

export type StorageStats = { products: number; orders: number; customers: number; images: number; imageBytes: number; pages: number; smsLogs: number };

const size = (n: number) => (n < 1024 * 1024 ? `${bn(Math.round(n / 1024))} KB` : `${bn(Number(mb(n)))} MB`);


export const BackupPage = (p: { stats: StorageStats; limit?: number }) => {
  const s = p.stats;
  const limit = p.limit || MEDIA_SOFT_LIMIT;
  const pct = Math.min(100, Math.round((s.imageBytes / limit) * 100));
  return (
    <>
      <PageHead title="স্টোরেজ" desc="আপনার দোকানের ডাটা আর ছবি কতটা জায়গা নিচ্ছে।" />

      <Card title="ডাটার কপি লাগবে?">
        <p class="muted">আপনার অর্ডার, পণ্য আর কাস্টমারের ডাটা SellxBD-তে নিরাপদে রাখা আছে। Excel কপি লাগলে <a href="/admin/support">সাপোর্টে</a> জানান — যাচাই করে পাঠিয়ে দেওয়া হবে।</p>
      </Card>

      <Card title="জায়গা কতটা খরচ হলো">
        <div class="media-usage">
          <div><strong>ছবি: {size(s.imageBytes)}</strong> <small class="muted">(প্ল্যানের সীমা {storageLabel(Math.round(limit / 1024 / 1024))})</small></div>
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
