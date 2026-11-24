import type { Variant } from "../lib/products";
import { taka } from "../lib/format";

/**
 * সাইজ/রং বাছাই — বড় টাইল, হাইলাইট করা বক্স (মোবাইলে চোখে পড়ার মতো)।
 * অর্ডার ফর্ম (ল্যান্ডিং/চেকআউট) আর পণ্যের পেজ দুই জায়গাতেই।
 * বাছাই না করলে বক্সটা আলতো দোলে আর জমা দিতে গেলে সেখানে স্ক্রল করে লাল হয় (app.js `[data-vt]`)।
 */
export const VariantTiles = (p: {
  variants: Variant[];
  basePrice: number;
  checked?: string;
  required?: boolean;
  pp?: boolean; // পণ্যের পেজের data-pp-variant
  error?: string;
}) => {
  const showPrice = p.variants.some((v) => v.price != null && v.price !== p.basePrice);
  return (
    <fieldset class={`field variant-field vt ${p.checked ? "vt-done" : ""} ${p.error ? "vt-err" : ""}`} data-vt>
      <legend class="vt-head">
        <span class="vt-ico" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z" /></svg>
        </span>
        <span class="vt-text">
          <span class="vt-title">সাইজ/রং বাছাই করুন<b class="vt-req" aria-label="আবশ্যক">*</b></span>
          <span class="vt-hint" data-vt-hint>নিচ থেকে আপনার পছন্দেরটা চাপুন <i class="vt-arrow" aria-hidden="true">↓</i></span>
        </span>
        <span class="vt-picked" data-vt-picked>{p.checked ? `✓ ${p.variants.find((v) => String(v.id) === p.checked)?.label ?? ""}` : ""}</span>
      </legend>
      <div class="variant-pills vt-grid">
        {p.variants.map((v) => (
          <label class={`pill-option vt-tile ${v.active ? "" : "disabled"}`}>
            <input type="radio" name="variant_id" value={String(v.id)} disabled={!v.active} required={p.required}
              checked={p.checked === String(v.id)} data-price={String(v.price ?? p.basePrice)} data-label={v.label} data-pp-variant={p.pp ? true : undefined} />
            <span>
              <b class="vt-label">{v.label}</b>
              {!v.active ? <small class="vt-sub">স্টকে নেই</small> : showPrice && <small class="vt-sub">{taka(v.price ?? p.basePrice)}</small>}
            </span>
          </label>
        ))}
      </div>
      {p.error && <small class="error">{p.error}</small>}
    </fieldset>
  );
};
