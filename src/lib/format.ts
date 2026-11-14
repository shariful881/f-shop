const BN_DIGITS = "০১২৩৪৫৬৭৮৯";

/** ইংরেজি অঙ্ক → বাংলা অঙ্ক */
export function bn(v: string | number): string {
  return String(v).replace(/[0-9]/g, (d) => BN_DIGITS[Number(d)]!);
}

/** ১২৫০ → ৳১,২৫০ */
export function taka(n: number): string {
  const s = Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return "৳" + bn(s);
}

/** UTC সময় ('YYYY-MM-DD HH:MM:SS') → ঢাকার সময়, যেমন 14/11/2026, 09:38 AM */
export function dhakaTime(utc: string | null | undefined): string {
  if (!utc) return "—";
  const d = new Date(utc.replace(" ", "T") + (utc.endsWith("Z") ? "" : "Z"));
  if (isNaN(d.getTime())) return utc;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dhaka",
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: true,
  }).format(d);
}

/** YouTube লিংক থেকে ভিডিও আইডি */
export function youtubeId(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/))([A-Za-z0-9_-]{11})/);
  return m ? m[1]! : null;
}

export function imageUrl(key: string | null | undefined): string {
  return key ? `/img/${key}` : "/img/placeholder.svg";
}

export function discountPercent(price: number, compare: number | null): number {
  if (!compare || compare <= price) return 0;
  return Math.round(((compare - price) / compare) * 100);
}
