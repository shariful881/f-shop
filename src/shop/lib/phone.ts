const BN = "০১২৩৪৫৬৭৮৯";

/**
 * যেকোনোভাবে লেখা বাংলাদেশি মোবাইল নম্বরকে 01XXXXXXXXX ফরম্যাটে আনে।
 * যেমন: "+880 1712-345678", "8801712345678", "০১৭১২৩৪৫৬৭৮", "1712345678" → "01712345678"
 * বৈধ না হলে null।
 */
export function normalizePhone(input: string | null | undefined): string | null {
  if (!input) return null;
  let s = String(input).replace(/[০-৯]/g, (d) => String(BN.indexOf(d)));
  s = s.replace(/\D/g, "");
  if (s.startsWith("0088")) s = s.slice(4);
  else if (s.startsWith("88") && s.length === 13) s = s.slice(2);
  if (s.length === 10 && s.startsWith("1")) s = "0" + s;
  return /^01[3-9]\d{8}$/.test(s) ? s : null;
}

/** 01712345678 → 8801712345678 (Facebook-এ hash করার জন্য) */
export function phoneE164Digits(phone: string): string {
  return "88" + phone;
}
