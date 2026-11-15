/**
 * ছবির ঘর — ক্লিক করলে ড্রপডাউন: পণ্যের ছবি / আমার লাইব্রেরি / নতুন আপলোড / রেডি ব্যাকগ্রাউন্ড।
 * জাভাস্ক্রিপ্ট (public/js/media.js) না চললে সাধারণ ফাইল বাছাই দিয়েই কাজ করে।
 *
 * সার্ভারে যা যায়: `<pickName>` = বাছাই করা ছবির key (লাইব্রেরি থেকে বা পিকারে আপলোড করা),
 * নয়তো `<fileName>` = সাধারণ ফাইল, আর `<removeName>` = সরিয়ে দেওয়া।
 */
import { imageUrl } from "../lib/format";
import { Icon } from "./icons";

export const MediaField = (p: {
  fileName: string;     // <input type=file name>
  pickName: string;     // লাইব্রেরি থেকে বাছাইয়ের hidden input
  removeName?: string;  // "সরিয়ে দিন" চেকবক্স (না দিলে সরানোর অপশন নেই)
  current?: string | null;
  folder: "product" | "banner" | "logo" | "landing" | "theme";
  ratio?: string;       // ক্রপের শুরুর মাপ, যেমন "1:1", "8:3", "free"
  accept?: string;
  size?: "sm" | "md";
}) => (
  <div class={`mf mf-${p.size ?? "md"}`} data-media-field data-folder={p.folder} data-ratio={p.ratio ?? "free"}>
    <button type="button" class="mf-preview" data-mf-open aria-label="ছবি বদলান">
      {p.current ? <img src={imageUrl(p.current)} alt="" /> : <span class="mf-empty"><Icon name="image" size="lg" /><small>ছবি বাছুন</small></span>}
    </button>
    <div class="mf-side">
      <div class="mf-actions">
        <button type="button" class="btn btn-sm btn-outline mf-js" data-mf-open><Icon name="image" size="sm" /> {p.current ? "ছবি বদলান" : "ছবি বাছুন"} ▾</button>
        {p.removeName && p.current && (
          <label class="small-check mf-remove"><input type="checkbox" name={p.removeName} value="1" data-mf-remove /> সরিয়ে দিন</label>
        )}
      </div>
      <input type="hidden" name={p.pickName} value="" data-mf-pick />
      <input type="file" name={p.fileName} accept={p.accept ?? "image/png,image/jpeg,image/webp"} class="mf-file" />
      <small class="mf-note" data-mf-note hidden></small>
    </div>
  </div>
);
