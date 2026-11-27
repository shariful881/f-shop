import { describe, expect, it } from "vitest";
import { cfgCss } from "../src/shop/lib/theme-config";

describe("রঙিন হেডারে মাউস রাখলে লেখা দেখা যায়", () => {
  it("গাঢ় হেডার: হেডারের লেখার রং + সাদা পর্দা", () => {
    const css = cfgCss({ c_header_bg: "#0f766e", c_header_text: "#ffffff" } as never);
    expect(css).toContain(".px-header .px-inline-nav a:hover");
    expect(css).toMatch(/px-inline-nav a:hover[^{]*\{color:#ffffff;background:rgba\(255,255,255,\.16\)/);
    expect(css).toContain(".px-header .px-call small");
  });
  it("সাদা হেডার: হালকা কালো পর্দা; রং না দিলে কিছু যোগ হয় না", () => {
    expect(cfgCss({ c_header_bg: "#ffffff", c_header_text: "#be185d" } as never)).toContain("color:#be185d;background:rgba(0,0,0,.06)");
    expect(cfgCss({} as never)).not.toContain("px-inline-nav a:hover");
  });
});
