/**
 * কাস্টমার — ফোন নম্বর ধরে সব অর্ডারের হিসাব (আলাদা টেবিল নয়, অর্ডার থেকেই)।
 */
import { bn, dhakaTime, taka } from "../lib/format";
import { Icon } from "./icons";
import { Badge, EmptyState, PageHead } from "./ui";

export type CustomerRow = {
  phone: string;
  name: string;
  orders: number;
  delivered: number; // কনফার্ম + শিপড
  bad: number;       // বাতিল + ফেক
  spent: number;     // কনফার্ম + শিপডের মোট
  last_at: string;
};

const PER_PAGE = 50;
export const CUSTOMERS_PER_PAGE = PER_PAGE;

/** ভালো/ঝুঁকির ছোট চিহ্ন — আগের অর্ডারের ফল দেখে */
const Health = ({ r }: { r: CustomerRow }) => {
  const done = r.delivered + r.bad;
  if (!done) return <Badge>নতুন</Badge>;
  const rate = r.delivered / done;
  if (rate >= 0.8) return <Badge tone="ok">ভালো কাস্টমার</Badge>;
  if (rate >= 0.5) return <Badge tone="warn">মাঝামাঝি</Badge>;
  return <Badge tone="bad">ঝুঁকি</Badge>;
};

export const CustomersPage = (p: { rows: CustomerRow[]; q: string; page: number; hasMore: boolean; total: number }) => (
  <>
    <PageHead title="কাস্টমার" desc={`মোট ${bn(p.total)} জন — ফোন নম্বর ধরে সব অর্ডার এক জায়গায়। কে নিয়মিত কেনে আর কে বারবার ফেরত দেয়, এখান থেকে বুঝবেন।`} />
    <form method="get" action="/admin/customers" class="search">
      <input type="search" name="q" value={p.q} placeholder="নাম বা ফোন নম্বর দিয়ে খুঁজুন" />
      <button class="btn"><Icon name="search" size="sm" /> খুঁজুন</button>
    </form>
    {p.rows.length === 0 ? (
      <div class="sa-card"><EmptyState icon="users" title={p.q ? "এই নামে বা নম্বরে কেউ নেই" : "এখনো কোনো কাস্টমার নেই"} text={p.q ? "অন্য কিছু লিখে খুঁজুন।" : "প্রথম অর্ডার এলেই কাস্টমার এখানে দেখাবে।"} /></div>
    ) : (
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>কাস্টমার</th><th>অর্ডার</th><th>ডেলিভারি / বাতিল</th><th>মোট কেনা</th><th>শেষ অর্ডার</th><th></th></tr></thead>
          <tbody>{p.rows.map((r) => (
            <tr>
              <td><strong>{r.name}</strong><br /><a href={`tel:${r.phone}`} class="muted small">{r.phone}</a></td>
              <td>{bn(r.orders)}</td>
              <td>{bn(r.delivered)} / {bn(r.bad)} <Health r={r} /></td>
              <td>{taka(r.spent)}</td>
              <td class="muted small">{dhakaTime(r.last_at)}</td>
              <td><a href={`/admin/orders?q=${encodeURIComponent(r.phone)}`} class="btn btn-sm">সব অর্ডার</a></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    )}
    {(p.page > 1 || p.hasMore) && (
      <div class="inline-actions" style="margin-top:12px">
        {p.page > 1 && <a class="btn btn-sm" href={`/admin/customers?page=${p.page - 1}&q=${encodeURIComponent(p.q)}`}>← আগের পাতা</a>}
        {p.hasMore && <a class="btn btn-sm" href={`/admin/customers?page=${p.page + 1}&q=${encodeURIComponent(p.q)}`}>পরের পাতা →</a>}
      </div>
    )}
  </>
);
