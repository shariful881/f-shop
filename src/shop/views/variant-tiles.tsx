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
        <span class="vt-title">সাইজ/রং বাছাই করুন <b class="vt-req">*</b></span>
        <span class="vt-hint" data-vt-hint>👇 নিচে থেকে একটা চাপুন</span>
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
