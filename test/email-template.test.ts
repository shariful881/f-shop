import { describe, expect, it } from "vitest";
import { verifyMail } from "../src/platform/verify";
import { resetMail } from "../src/shop/lib/password-reset";

describe("ইমেইলের নকশা", () => {
  const url = "https://shop1.sellxbd.com/verify/email?t=abc&x=1";
  it("যাচাইয়ের ইমেইলে বোতাম, লিংক, দোকান, সাপোর্ট নম্বর", () => {
    const m = verifyMail("bn", "mamus store", url, "01300901666", "https://sellxbd.com");
    expect(m.subject).toBe("mamus store — ইমেইল যাচাই করুন");
    expect(m.html).toContain('href="https://shop1.sellxbd.com/verify/email?t=abc&amp;x=1"');
    expect(m.html).toContain("mamus store");
    expect(m.html).toContain("২ দিন");
    expect(m.html).toContain("tel:01300901666");
    expect(m.html).toContain('name="viewport"');
    expect(m.text).toContain(url);
  });
  it("ইংরেজি আর রিসেট; দোকানের নাম নিরাপদ", () => {
    const e = verifyMail("en", "a<b>", url, undefined, "https://sellxbd.com");
    expect(e.subject).toContain("verify your email");
    expect(e.html).not.toContain("a<b>");
    expect(e.html).not.toContain("tel:");
    const r = resetMail("bn", "mamus store", "https://shop1.sellxbd.com/admin/reset?t=z", "01300901666", "https://sellxbd.com");
    expect(r.subject).toBe("mamus store — পাসওয়ার্ড রিসেট");
    expect(r.html).toContain("নতুন পাসওয়ার্ড দিন");
  });
});
