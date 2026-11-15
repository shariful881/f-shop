/** ধাপ ৮: sellxbd.com-এর বাংলা ব্লগ */
export type BlogPost = { id: number; slug: string; title: string; excerpt: string; body_html: string; status: "draft" | "published"; published_at: string | null; created_at: string; updated_at: string };

export async function publishedPosts(db: D1Database, limit = 50): Promise<BlogPost[]> {
  const { results } = await db.prepare("SELECT * FROM blog_posts WHERE status = 'published' ORDER BY published_at DESC, id DESC LIMIT ?").bind(limit).all<BlogPost>();
  return results;
}

export async function postBySlug(db: D1Database, slug: string): Promise<BlogPost | null> {
  return db.prepare("SELECT * FROM blog_posts WHERE slug = ? AND status = 'published'").bind(slug).first<BlogPost>();
}

export const slugOk = (s: string) => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(s) && s.length <= 80;
export const dateBn = (utc: string | null) => {
  if (!utc) return "";
  const d = new Date(utc.replace(" ", "T") + "Z");
  return isNaN(d.getTime()) ? "" : d.toLocaleDateString("bn-BD", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Dhaka" });
};
