/**
 * মিডিয়া পেজ — দোকানের সব ছবি: ফোল্ডার, খোঁজা, কোথায় ব্যবহার হচ্ছে, জায়গা, আপলোড, মোছা।
 */
import { bn, dhakaTime } from "../lib/format";
import { FOLDER_LABEL, MEDIA_SOFT_LIMIT, mb, type MediaFolder, type MediaItem } from "../lib/media";
import { Icon } from "./icons";
import { EmptyState, PageHead } from "./ui";

const kb = (n: number) => (n < 1024 * 1024 ? `${bn(Math.round(n / 1024))} KB` : `${bn(Number(mb(n)))} MB`);

export const MediaPage = (p: { items: MediaItem[]; total: number; bytes: number; hasMore: boolean; folder: MediaFolder | "unused" | ""; q: string; page: number }) => {
  const pct = Math.min(100, Math.round((p.bytes / MEDIA_SOFT_LIMIT) * 100));
  const qs = (extra: Record<string, string | number>) => {
    const u = new URLSearchParams();
    if (p.folder) u.set("folder", p.folder);
    if (p.q) u.set("q", p.q);
    for (const [k, v] of Object.entries(extra)) u.set(k, String(v));
    const s = u.toString();
    return `/admin/media${s ? `?${s}` : ""}`;
  };
  const back = qs({ page: p.page });
  const uploadFolder = p.folder && p.folder !== "unused" ? p.folder : "product";
  return (
    <>
      <PageHead
        title="মিডিয়া"
        desc="দোকানের সব ছবি এক জায়গায়। এখান থেকে যেকোনো ছবি পণ্য, ব্যানার বা ল্যান্ডিং পেজে আবার ব্যবহার করা যায় — একই ছবি বারবার আপলোড করতে হয় না।"
        actions={
          <form method="post" action="/admin/media/upload" enctype="multipart/form-data" class="media-upload" data-media-upload>
            <input type="hidden" name="folder" value={uploadFolder} />
            <label class="btn btn-primary">
              <Icon name="upload" size="sm" /> ছবি আপলোড
              <input type="file" name="files" multiple accept="image/jpeg,image/png,image/webp" hidden data-autosubmit />
            </label>
          </form>
        }
      />

      <div class="media-usage sa-card">
        <div>
          <strong>{bn(p.total)}টা ছবি</strong> · {kb(p.bytes)} ব্যবহার হয়েছে
          <small class="muted"> (প্রস্তাবিত সীমা {bn(MEDIA_SOFT_LIMIT / 1024 / 1024)} MB)</small>
        </div>
        <div class={`media-meter${pct >= 80 ? " warn" : ""}`}><i style={`width:${pct}%`}></i></div>
        {pct >= 80 && <small class="muted">জায়গা প্রায় শেষ — "অব্যবহৃত" থেকে পুরনো ছবি মুছে দিন।</small>}
      </div>

      <div class="orders-tools">
        <nav class="tabs media-tabs">
          <a href="/admin/media" class={!p.folder ? "tab active" : "tab"}>সব</a>
          {(Object.keys(FOLDER_LABEL) as MediaFolder[]).map((f) => (
            <a href={`/admin/media?folder=${f}`} class={p.folder === f ? "tab active" : "tab"}>{FOLDER_LABEL[f]}</a>
          ))}
          <a href="/admin/media?folder=unused" class={p.folder === "unused" ? "tab active" : "tab"}>অব্যবহৃত</a>
        </nav>
        <form method="get" action="/admin/media" class="search">
          {p.folder && <input type="hidden" name="folder" value={p.folder} />}
          <input type="search" name="q" value={p.q} placeholder="নাম বা পণ্যের নাম দিয়ে খুঁজুন" />
          <button class="btn btn-outline"><Icon name="search" size="sm" /></button>
        </form>
      </div>

      {p.items.length === 0 ? (
        <div class="sa-card">
          <EmptyState icon="image" title={p.q || p.folder ? "এখানে কোনো ছবি নেই" : "এখনো কোনো ছবি নেই"}
            text={p.folder === "unused" ? "সব ছবিই কোথাও না কোথাও ব্যবহার হচ্ছে।" : "উপরের \"ছবি আপলোড\" চেপে ছবি যোগ করুন। একসাথে অনেকগুলো বাছা যায়।"} />
        </div>
      ) : (
        <form method="post" action="/admin/media/delete" class="media-form">
          <input type="hidden" name="back" value={back} />
          <div class="bulk-bar">
            <label class="inline-check"><input type="checkbox" data-check-all /> সব বাছুন</label>
            <button class="btn btn-sm btn-danger" data-confirm="বাছাই করা ছবিগুলো মুছবেন? যেগুলো কোথাও ব্যবহার হচ্ছে সেগুলো মোছা হবে না।"><Icon name="trash-2" size="sm" /> মুছুন</button>
            <span class="bulk-gap"></span>
            <small class="muted">ব্যবহার হওয়া ছবি মোছা যায় না — আগে সেখান থেকে বদলান।</small>
          </div>
          <div class="media-grid">
            {p.items.map((m) => (
              <div class={`media-card${m.used.length ? "" : " unused"}`}>
                <label class="media-check"><input type="checkbox" name="keys" value={m.key} aria-label={m.name || m.key} /></label>
                <a href={`/img/${m.key}`} target="_blank" rel="noopener" class="media-thumb"><img src={`/img/${m.key}`} alt={m.alt || ""} loading="lazy" /></a>
                <div class="media-meta">
                  <strong title={m.name || ""}>{m.name || "নাম নেই"}</strong>
                  <small class="muted">
                    {FOLDER_LABEL[m.folder]} · {kb(m.size)}{m.width && m.height ? ` · ${bn(m.width)}×${bn(m.height)}` : ""}
                  </small>
                  {m.used.length
                    ? <small class="media-used" title={m.used.join("\n")}><Icon name="check" size="sm" /> {m.used[0]}{m.used.length > 1 ? ` +${bn(m.used.length - 1)}` : ""}</small>
                    : <small class="media-free">অব্যবহৃত</small>}
                  <small class="muted">{dhakaTime(m.created_at)}</small>
                </div>
                <button type="button" class="btn-link media-copy" data-copy={`/img/${m.key}`}><Icon name="copy" size="sm" /> লিংক কপি</button>
              </div>
            ))}
          </div>
        </form>
      )}
      {(p.page > 1 || p.hasMore) && (
        <div class="pager">
          {p.page > 1 && <a class="btn btn-outline" href={qs({ page: p.page - 1 })}>← আগের</a>}
          {p.hasMore && <a class="btn btn-outline" href={qs({ page: p.page + 1 })}>পরের →</a>}
        </div>
      )}
    </>
  );
};
