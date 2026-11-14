# ডেমো দোকানের পণ্য আর ব্যানারের ছবি — কোড দিয়ে আঁকা (SVG → Chrome → JPG)
# চালান: python3 demo/draw.py [key ...]   → demo/images/<key>-NN.jpg, <key>-banner-N.jpg
import asyncio, json, math, pathlib, random, sys
from playwright.async_api import async_playwright

ROOT = pathlib.Path(__file__).parent
OUT = ROOT / "images"; OUT.mkdir(exist_ok=True)
FONTS = "/tmp/fonts"
SHOPS = json.load(open(ROOT / "niches.json"))

# ---------- রং ----------
def rgb(h):
    h = h.lstrip("#")[:6]
    if len(h) == 3: h = "".join(ch * 2 for ch in h)
    return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))
def hexc(t): return "#" + "".join(f"{max(0,min(255,int(v))):02x}" for v in t)
def shade(h, f):  # f<1 গাঢ়, f>1 হালকা
    r = rgb(h)
    return hexc([v * f for v in r]) if f <= 1 else hexc([v + (255 - v) * (f - 1) for v in r])

_gid = [0]
def gid(): _gid[0] += 1; return f"g{_gid[0]}"

def lin(c1, c2, vertical=False):
    i = gid()
    xy = 'x1="0" y1="0" x2="0" y2="1"' if vertical else 'x1="0" y1="0" x2="1" y2="0"'
    return i, f'<linearGradient id="{i}" {xy}><stop offset="0" stop-color="{c1}"/><stop offset="1" stop-color="{c2}"/></linearGradient>'

def body(c):  # সিলিন্ডারের মতো আলো-ছায়া
    i = gid()
    return i, (f'<linearGradient id="{i}" x1="0" x2="1"><stop offset="0" stop-color="{shade(c,.72)}"/><stop offset=".28" stop-color="{shade(c,1.25)}"/>'
               f'<stop offset=".45" stop-color="{c}"/><stop offset="1" stop-color="{shade(c,.62)}"/></linearGradient>')

GLOSS = '<linearGradient id="gloss" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".22" stop-color="#fff" stop-opacity=".45"/><stop offset=".34" stop-color="#fff" stop-opacity="0"/></linearGradient>'
SOFT = '<filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="10" stdDeviation="12" flood-color="#000" flood-opacity=".18"/></filter>'

class D:
    """একটা ছবির SVG জমানো"""
    def __init__(self): self.defs = [GLOSS, SOFT]; self.parts = []
    def grad(self, pair): self.defs.append(pair[1]); return f"url(#{pair[0]})"
    def add(self, s): self.parts.append(s)
    def svg(self, w=640, h=640): return f'<svg width="720" height="720" viewBox="0 0 {w} {h}" xmlns="http://www.w3.org/2000/svg"><defs>{"".join(self.defs)}</defs>{"".join(self.parts)}</svg>'

def label(d, x, y, w, h, title, sub="", color="#333", bg="#fffaf2", fs=None):
    fs = fs or max(16, min(34, int(w / max(4, len(title)) * 1.6)))
    d.add(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="8" fill="{bg}"/>')
    d.add(f'<text x="{x+w/2}" y="{y+h/2 + (fs*0.15 if not sub else -2)}" font-family="B" font-size="{fs}" font-weight="700" fill="{color}" text-anchor="middle">{title}</text>')
    if sub: d.add(f'<text x="{x+w/2}" y="{y+h/2+fs*0.85}" font-family="H" font-size="{int(fs*.55)}" fill="{shade(color,.8)}" text-anchor="middle">{sub}</text>')

# ---------- নকশা (কাপড়ের প্রিন্ট) ----------
def pattern(d, kind, base, ink, ink2=None, scale=1.0):
    i = gid(); ink2 = ink2 or shade(ink, 1.4); s = int(60 * scale)
    shapes = {
        "floral": f'<circle cx="{s*.25}" cy="{s*.25}" r="{s*.12}" fill="{ink}"/><circle cx="{s*.25}" cy="{s*.25}" r="{s*.05}" fill="#ffd166"/><circle cx="{s*.75}" cy="{s*.75}" r="{s*.1}" fill="{ink2}"/><path d="M{s*.5} {s*.42} q{s*.08} {s*.08} 0 {s*.16} q-{s*.08} -{s*.08} 0 -{s*.16}" fill="#6a994e"/>',
        "dots": f'<circle cx="{s*.25}" cy="{s*.25}" r="{s*.07}" fill="{ink}"/><circle cx="{s*.75}" cy="{s*.75}" r="{s*.07}" fill="{ink2}"/>',
        "paisley": f'<path d="M{s*.3} {s*.7} c-{s*.2} -{s*.25} {s*.05} -{s*.55} {s*.25} -{s*.4} c{s*.12} {s*.1} {s*.05} {s*.3} -{s*.25} {s*.4}z" fill="{ink}"/><circle cx="{s*.42}" cy="{s*.42}" r="{s*.05}" fill="{ink2}"/><circle cx="{s*.8}" cy="{s*.2}" r="{s*.04}" fill="{ink}"/>',
        "stripe": f'<rect width="{s*.18}" height="{s}" fill="{ink}"/><rect x="{s*.5}" width="{s*.06}" height="{s}" fill="{ink2}"/>',
        "check": f'<rect width="{s*.5}" height="{s*.5}" fill="{ink}" opacity=".35"/><rect x="{s*.5}" y="{s*.5}" width="{s*.5}" height="{s*.5}" fill="{ink}" opacity=".35"/>',
        "leaf": f'<path d="M{s*.2} {s*.8} q{s*.1} -{s*.5} {s*.5} -{s*.6} q-{s*.1} {s*.5} -{s*.5} {s*.6}z" fill="{ink}"/><path d="M{s*.2} {s*.8} l{s*.5} -{s*.6}" stroke="{ink2}" stroke-width="2"/>',
        "jacquard": f'<path d="M0 {s*.5} l{s*.25} -{s*.25} l{s*.25} {s*.25} l{s*.25} -{s*.25} l{s*.25} {s*.25}" stroke="{ink}" stroke-width="{s*.06}" fill="none"/><circle cx="{s*.5}" cy="{s*.8}" r="{s*.05}" fill="{ink2}"/>',
        "sequin": f'<circle cx="{s*.2}" cy="{s*.2}" r="{s*.05}" fill="{ink}"/><circle cx="{s*.6}" cy="{s*.35}" r="{s*.04}" fill="{ink2}"/><circle cx="{s*.35}" cy="{s*.7}" r="{s*.05}" fill="{ink}"/><circle cx="{s*.85}" cy="{s*.8}" r="{s*.03}" fill="{ink2}"/>',
        "plain": "",
    }[kind]
    d.defs.append(f'<pattern id="{i}" width="{s}" height="{s}" patternUnits="userSpaceOnUse"><rect width="{s}" height="{s}" fill="{base}"/>{shapes}</pattern>')
    return f"url(#{i})"

# ================= পণ্যের আঁকা =================
def fabric_set(d, base, ink, kind, dupatta, trouser, gold=False, embroid=False):
    d.add('<g filter="url(#soft)">')
    d.add(f'<g transform="translate(80,360) rotate(-5)"><rect width="440" height="140" rx="10" fill="{trouser}"/><rect width="440" height="22" fill="{shade(trouser,.85)}"/></g>')
    dp = pattern(d, "dots" if not gold else "sequin", dupatta, shade(ink, 1.1), "#d4a017" if gold else None, .8)
    d.add(f'<g transform="translate(120,240) rotate(4)"><rect width="430" height="160" rx="10" fill="{dp}"/><rect y="130" width="430" height="16" fill="{"#d4a017" if gold else shade(ink,.9)}"/>'
          f'<rect y="130" width="430" height="16" fill="none" stroke="#fff" stroke-width="2" stroke-dasharray="4 6" opacity=".7"/></g>')
    pf = pattern(d, kind, base, ink)
    d.add(f'<g transform="translate(95,120) rotate(-3)"><rect width="450" height="200" rx="12" fill="{pf}"/><rect width="450" height="200" rx="12" fill="url(#gloss)" opacity=".35"/>')
    if embroid or gold:
        c = "#d4a017" if gold else shade(ink, .8)
        d.add(f'<path d="M170 0 q55 80 110 0" fill="none" stroke="{c}" stroke-width="14"/><path d="M170 0 q55 80 110 0" fill="none" stroke="#fff" stroke-width="2" stroke-dasharray="3 6"/>')
        for k in range(6): d.add(f'<circle cx="{185+k*16}" cy="{40+ (8 if 1<k<4 else 0)}" r="5" fill="{c}"/>')
    d.add('</g></g>')

def kurti(d, base, ink, kind):
    d.add(f'<path d="M320 70 q-30 0 -30 25 m30 -25 q30 0 30 25" stroke="#8d6e63" stroke-width="7" fill="none"/><path d="M190 120 h260" stroke="#8d6e63" stroke-width="10" stroke-linecap="round"/>')
    pf = pattern(d, kind, base, ink)
    d.add(f'<g filter="url(#soft)"><path d="M230 120 L150 200 L185 250 L220 215 L200 540 L440 540 L420 215 L455 250 L490 200 L410 120 Q320 175 230 120Z" fill="{pf}"/>'
          f'<path d="M285 122 Q320 170 355 122" fill="none" stroke="{shade(ink,.8)}" stroke-width="9"/><path d="M205 520 L435 520" stroke="{shade(ink,.8)}" stroke-width="12"/>'
          f'<path d="M230 120 L150 200 L185 250 L220 215 L200 540 L440 540 L420 215 L455 250 L490 200 L410 120 Q320 175 230 120Z" fill="url(#gloss)" opacity=".25"/></g>')

def tube(d, c, cap, title, sub, x=230, w=180, h=360, y=150, rot=0):
    d.add(f'<g transform="rotate({rot} 320 330)" filter="url(#soft)">')
    d.add(f'<rect x="{x+w*.25}" y="{y+h-6}" width="{w*.5}" height="60" rx="8" fill="{d.grad(body(cap))}"/>')
    d.add(f'<path d="M{x} {y} h{w} l-12 {h} h-{w-24} z" fill="{d.grad(body(c))}"/><rect x="{x-4}" y="{y-14}" width="{w+8}" height="22" rx="3" fill="{shade(c,.9)}"/>')
    label(d, x + 22, y + h * .3, w - 44, h * .32, title, sub, color=shade(cap, .7), bg="#ffffffdd")
    d.add('</g>')

def dropper(d, c, title, sub, deco=None):
    if deco: deco(d)
    d.add('<g filter="url(#soft)">')
    d.add(f'<rect x="282" y="70" width="76" height="70" rx="36" fill="#2b2b2b"/><rect x="262" y="128" width="116" height="70" rx="12" fill="{d.grad(body("#3a3a3a"))}"/>')
    d.add(f'<rect x="215" y="190" width="210" height="330" rx="34" fill="{d.grad(body(c))}" opacity=".95"/><rect x="215" y="190" width="210" height="330" rx="34" fill="url(#gloss)"/>')
    label(d, 238, 300, 164, 130, title, sub, color=shade(c, .55))
    d.add('</g>')

def jar(d, c, lid, title, sub, wide=False, cream=None):
    w = 330 if wide else 270; x = 320 - w / 2
    d.add('<g filter="url(#soft)">')
    if cream: d.add(f'<ellipse cx="{320+w/2+40}" cy="510" rx="60" ry="20" fill="{cream}"/><ellipse cx="{320+w/2+40}" cy="503" rx="40" ry="12" fill="{shade(cream,1.2)}"/>')
    d.add(f'<rect x="{x+10}" y="165" width="{w-20}" height="70" rx="14" fill="{d.grad(body(lid))}"/>')
    d.add(f'<path d="M{x} 230 h{w} q16 0 16 16 v220 q0 50 -50 50 h-{w-68} q-50 0 -50 -50 v-220 q0 -16 16 -16z" fill="{d.grad(body(c))}"/>')
    d.add(f'<path d="M{x} 230 h{w} q16 0 16 16 v220 q0 50 -50 50 h-{w-68} q-50 0 -50 -50 v-220 q0 -16 16 -16z" fill="url(#gloss)"/>')
    label(d, x + 30, 310, w - 60, 120, title, sub, color=shade(lid, .6))
    d.add('</g>')

def bottle(d, c, cap, title, sub, tall=True, pump=False):
    d.add('<g filter="url(#soft)">')
    if pump: d.add(f'<rect x="300" y="60" width="40" height="70" fill="{cap}"/><rect x="300" y="60" width="110" height="26" rx="10" fill="{cap}"/>')
    d.add(f'<rect x="282" y="{100 if tall else 150}" width="76" height="60" rx="10" fill="{d.grad(body(cap))}"/>')
    top = 150 if tall else 200
    d.add(f'<path d="M290 {top} h60 q0 40 60 70 v260 q0 30 -30 30 h-120 q-30 0 -30 -30 v-260 q60 -30 60 -70z" fill="{d.grad(body(c))}" opacity=".95"/>')
    d.add(f'<path d="M290 {top} h60 q0 40 60 70 v260 q0 30 -30 30 h-120 q-30 0 -30 -30 v-260 q60 -30 60 -70z" fill="url(#gloss)"/>')
    label(d, 245, 330, 150, 120, title, sub, color=shade(cap, .6))
    d.add('</g>')

def stick(d, c, title):
    d.add(f'<g filter="url(#soft)" transform="rotate(-12 320 330)"><rect x="265" y="130" width="110" height="90" rx="20" fill="{d.grad(body("#f3f3f3"))}"/>'
          f'<rect x="250" y="210" width="140" height="310" rx="26" fill="{d.grad(body(c))}"/><rect x="250" y="210" width="140" height="310" rx="26" fill="url(#gloss)"/></g>')
    label(d, 268, 330, 104, 90, title, "", color=shade(c, .55))

def bowl(d, item, c_bowl="#8d5524", n=26, seed=1):
    random.seed(seed)
    d.add(f'<g filter="url(#soft)"><ellipse cx="320" cy="360" rx="230" ry="60" fill="{shade(c_bowl,.8)}"/>')
    for k in range(n):
        a = random.uniform(0, math.pi * 2); r = random.uniform(0, 1) ** .5
        item(d, 320 + math.cos(a) * 190 * r, 340 + math.sin(a) * 45 * r - random.uniform(0, 30), random.uniform(-40, 40))
    d.add(f'<path d="M90 360 q0 170 230 170 q230 0 230 -170 q-230 60 -460 0z" fill="{d.grad(body(c_bowl))}"/></g>')

def date_item(c):  # খেজুর
    return lambda d, x, y, r: d.add(f'<ellipse cx="{x}" cy="{y}" rx="34" ry="20" transform="rotate({r} {x} {y})" fill="{c}"/><ellipse cx="{x-8}" cy="{y-6}" rx="12" ry="5" transform="rotate({r} {x} {y})" fill="#fff" opacity=".25"/>')
def nut_item(c, rx=26, ry=16):
    return lambda d, x, y, r: d.add(f'<ellipse cx="{x}" cy="{y}" rx="{rx}" ry="{ry}" transform="rotate({r} {x} {y})" fill="{c}" stroke="{shade(c,.75)}" stroke-width="2"/>')
def cashew_item(c):
    return lambda d, x, y, r: d.add(f'<path d="M{x-20} {y} q0 -26 24 -24 q22 3 14 20 q-8 -10 -18 -6 q-8 4 -6 16 q-14 6 -14 -6z" transform="rotate({r} {x} {y})" fill="{c}" stroke="{shade(c,.8)}" stroke-width="2"/>')
def seed_item(c):
    return lambda d, x, y, r: d.add(f'<circle cx="{x}" cy="{y}" r="5" fill="{c}"/><circle cx="{x+9}" cy="{y+4}" r="4" fill="{shade(c,1.3)}"/><circle cx="{x-7}" cy="{y+6}" r="4" fill="{c}"/>')
def mix_item(cols):
    def f(d, x, y, r):
        c = random.choice(cols); d.add(f'<ellipse cx="{x}" cy="{y}" rx="22" ry="15" transform="rotate({r} {x} {y})" fill="{c}" stroke="{shade(c,.8)}" stroke-width="2"/>')
    return f

def honeycomb(d, x, y, n=4):
    for k, (dx, dy) in enumerate([(0, 0), (40, 0), (20, 34), (60, 34), (80, 0)][:n]):
        d.add(f'<polygon transform="translate({x+dx},{y+dy})" points="20,0 40,11 40,34 20,45 0,34 0,11" fill="#f7b733" stroke="#c46d00" stroke-width="4"/>')

def flowers(d, x, y, c="#ffd60a", n=5):
    for k in range(n):
        cx, cy = x + k * 26 - (k % 2) * 8, y + (k % 2) * 22
        for a in range(5):
            d.add(f'<ellipse cx="{cx+math.cos(a*1.257)*9}" cy="{cy+math.sin(a*1.257)*9}" rx="7" ry="5" fill="{c}" transform="rotate({a*72} {cx} {cy})"/>')
        d.add(f'<circle cx="{cx}" cy="{cy}" r="5" fill="#b5651d"/>')

def fruit(d, x, y, c, r=40, leaf=True):
    d.add(f'<circle cx="{x}" cy="{y}" r="{r}" fill="{d.grad(body(c))}"/>')
    if leaf: d.add(f'<path d="M{x} {y-r} q14 -24 34 -20 q-12 18 -34 20z" fill="#4caf50"/>')

def orange_slice(d, x, y, r=62):
    d.add(f'<circle cx="{x}" cy="{y}" r="{r}" fill="#ff9f1c"/><circle cx="{x}" cy="{y}" r="{r-10}" fill="#ffbf69"/>')
    for a in range(8): d.add(f'<line x1="{x}" y1="{y}" x2="{x+math.cos(a*.785)*(r-12)}" y2="{y+math.sin(a*.785)*(r-12)}" stroke="#ff9f1c" stroke-width="4"/>')

def leaves(d, x, y, c="#52b788", n=3, s=1):
    for k in range(n):
        d.add(f'<path d="M{x} {y} q{30*s} -{60*s} {80*s} -{50*s} q-{20*s} {50*s} -{80*s} {50*s}z" fill="{shade(c,1-k*.12)}" transform="rotate({-30+k*35} {x} {y})"/>')

# --- গ্যাজেট ---
def earbuds(d, c, accent="#2ee59d", gaming=False):
    d.add('<g filter="url(#soft)">')
    d.add(f'<rect x="170" y="280" width="300" height="190" rx="88" fill="{d.grad(body(c))}"/><rect x="170" y="280" width="300" height="190" rx="88" fill="url(#gloss)" opacity=".6"/><line x1="182" y1="340" x2="458" y2="340" stroke="{shade(c,.6)}" stroke-width="3"/><circle cx="320" cy="415" r="6" fill="{accent}"/>')
    if gaming: d.add(f'<rect x="200" y="440" width="240" height="8" rx="4" fill="{accent}" opacity=".9"/>')
    for x, r in ((205, -15), (375, 15)):
        d.add(f'<g transform="translate({x},140) rotate({r})"><ellipse cx="40" cy="40" rx="40" ry="44" fill="{d.grad(body(c))}"/><rect x="25" y="70" width="30" height="90" rx="15" fill="{d.grad(body(c))}"/><ellipse cx="40" cy="38" rx="18" ry="20" fill="{shade(c,.7)}"/></g>')
    d.add('</g>')

def watch(d, c, strap, round_=False, face="#0b132b", slim=False):
    d.add('<g filter="url(#soft)">')
    sw = 120 if slim else 150
    d.add(f'<rect x="{320-sw/2}" y="60" width="{sw}" height="520" rx="40" fill="{d.grad(body(strap))}"/>')
    for k in range(5): d.add(f'<circle cx="320" cy="{460+k*22}" r="5" fill="{shade(strap,.7)}"/>')
    if round_: d.add(f'<circle cx="320" cy="320" r="150" fill="{d.grad(body(c))}"/><circle cx="320" cy="320" r="128" fill="{face}"/>')
    else: d.add(f'<rect x="{320-130}" y="175" width="260" height="300" rx="56" fill="{d.grad(body(c))}"/><rect x="{320-112}" y="195" width="224" height="260" rx="42" fill="{face}"/>')
    d.add(f'<text x="320" y="315" font-family="B" font-size="70" fill="#fff" text-anchor="middle">10:09</text>'
          f'<text x="320" y="355" font-family="H" font-size="22" fill="#9ad1ff" text-anchor="middle">♥ 72  ·  8,450 ধাপ</text>'
          f'<path d="M250 390 a70 70 0 0 1 140 0" stroke="#2ee59d" stroke-width="8" fill="none" stroke-linecap="round"/>')
    d.add('</g>')

def band(d, c):
    d.add(f'<g filter="url(#soft)"><ellipse cx="320" cy="330" rx="230" ry="150" fill="none" stroke="{c}" stroke-width="56"/>'
          f'<rect x="230" y="150" width="180" height="90" rx="30" fill="#111"/><rect x="245" y="160" width="150" height="70" rx="22" fill="#0b132b"/>'
          f'<text x="320" y="207" font-family="B" font-size="34" fill="#fff" text-anchor="middle">♥ 76</text></g>')

def neckband(d, c):
    d.add(f'<g filter="url(#soft)"><path d="M140 260 q180 260 360 0" stroke="{c}" stroke-width="34" fill="none" stroke-linecap="round"/>'
          f'<rect x="110" y="200" width="60" height="120" rx="30" fill="{d.grad(body(c))}"/><rect x="470" y="200" width="60" height="120" rx="30" fill="{d.grad(body(c))}"/>'
          f'<path d="M140 210 q-30 -60 0 -100" stroke="#222" stroke-width="6" fill="none"/><path d="M500 210 q30 -60 0 -100" stroke="#222" stroke-width="6" fill="none"/>'
          f'<circle cx="140" cy="105" r="22" fill="#222"/><circle cx="500" cy="105" r="22" fill="#222"/></g>')

def headphones(d, c, rgb_=None):
    d.add(f'<g filter="url(#soft)"><path d="M150 360 q0 -230 170 -230 q170 0 170 230" stroke="{c}" stroke-width="30" fill="none"/>'
          f'<rect x="110" y="300" width="100" height="170" rx="45" fill="{d.grad(body(c))}"/><rect x="430" y="300" width="100" height="170" rx="45" fill="{d.grad(body(c))}"/>')
    if rgb_:
        d.add(f'<rect x="125" y="330" width="16" height="110" rx="8" fill="{rgb_}"/><rect x="499" y="330" width="16" height="110" rx="8" fill="{rgb_}"/>'
              f'<path d="M150 450 q40 80 120 70" stroke="#222" stroke-width="10" fill="none"/><circle cx="275" cy="518" r="12" fill="#222"/>')
    d.add('</g>')

def speaker(d, c):
    d.add(f'<g filter="url(#soft)"><rect x="170" y="190" width="300" height="300" rx="90" fill="{d.grad(body(c))}"/>'
          + "".join(f'<circle cx="{220+i*22}" cy="{240+j*22}" r="4" fill="{shade(c,.6)}"/>' for i in range(10) for j in range(10) if (i-4.5)**2+(j-4.5)**2 < 22)
          + f'<rect x="270" y="470" width="100" height="14" rx="7" fill="#111"/></g>')

def powerbank(d, c, magnetic=False):
    d.add(f'<g filter="url(#soft)" transform="rotate(-8 320 330)"><rect x="200" y="{140 if not magnetic else 170}" width="240" height="{360 if not magnetic else 300}" rx="40" fill="{d.grad(body(c))}"/>'
          f'<rect x="200" y="140" width="240" height="360" rx="40" fill="url(#gloss)" opacity="{0 if magnetic else .4}"/>')
    if magnetic: d.add(f'<circle cx="320" cy="320" r="85" fill="none" stroke="{shade(c,.85)}" stroke-width="8"/>')
    else: d.add(f'<rect x="270" y="210" width="100" height="56" rx="8" fill="#0b132b"/><text x="320" y="250" font-family="B" font-size="34" fill="#2ee59d" text-anchor="middle">98%</text>'
                f'<circle cx="320" cy="440" r="7" fill="#2ee59d"/>')
    d.add('</g>')

def charger(d, c, car=False):
    d.add('<g filter="url(#soft)">')
    if car:
        d.add(f'<rect x="260" y="150" width="120" height="200" rx="30" fill="{d.grad(body(c))}"/><rect x="290" y="340" width="60" height="140" rx="12" fill="{d.grad(body("#9e9e9e"))}"/>'
              f'<rect x="280" y="190" width="30" height="14" rx="3" fill="#111"/><rect x="330" y="190" width="30" height="14" rx="3" fill="#111"/><circle cx="320" cy="250" r="7" fill="#4fc3f7"/>')
    else:
        d.add(f'<rect x="200" y="180" width="170" height="200" rx="26" fill="{d.grad(body(c))}"/><rect x="230" y="140" width="14" height="50" fill="#bbb"/><rect x="326" y="140" width="14" height="50" fill="#bbb"/>'
              f'<rect x="255" y="300" width="60" height="16" rx="4" fill="#333"/>'
              f'<path d="M285 380 q0 120 120 100 q120 -20 60 -120 q-50 -80 40 -140" stroke="{c}" stroke-width="16" fill="none" stroke-linecap="round"/><rect x="490" y="190" width="30" height="60" rx="8" fill="{c}"/>')
    d.add('</g>')

def cable(d, c):
    d.add('<g filter="url(#soft)">')
    for k in range(5): d.add(f'<ellipse cx="320" cy="330" rx="{170-k*14}" ry="{110-k*10}" fill="none" stroke="{shade(c,1-k*.04)}" stroke-width="18" stroke-dasharray="5 3"/>')
    d.add(f'<rect x="420" y="170" width="40" height="90" rx="10" fill="#cfd8dc"/><rect x="180" y="400" width="40" height="90" rx="10" fill="#cfd8dc"/></g>')

def phone(d, x, y, w=150, h=300, rot=0):
    d.add(f'<g transform="rotate({rot} {x+w/2} {y+h/2})"><rect x="{x}" y="{y}" width="{w}" height="{h}" rx="24" fill="#111"/><rect x="{x+8}" y="{y+10}" width="{w-16}" height="{h-20}" rx="18" fill="{d.grad(lin("#4facfe","#00f2fe",True))}"/></g>')

def stand(d):
    d.add(f'<g filter="url(#soft)"><path d="M180 500 h280 l-40 -40 h-200z" fill="{d.grad(body("#b0bec5"))}"/><path d="M300 470 l-60 -200 l30 -10 l70 210z" fill="#90a4ae"/></g>')
    phone(d, 250, 150, 150, 280, -18)

def selfie(d):
    d.add(f'<g filter="url(#soft)"><line x1="320" y1="200" x2="320" y2="470" stroke="#222" stroke-width="18"/>'
          f'<line x1="320" y1="470" x2="200" y2="560" stroke="#222" stroke-width="12"/><line x1="320" y1="470" x2="440" y2="560" stroke="#222" stroke-width="12"/><line x1="320" y1="470" x2="320" y2="575" stroke="#222" stroke-width="12"/>'
          f'<rect x="440" y="300" width="60" height="110" rx="20" fill="#333"/><circle cx="470" cy="340" r="12" fill="#4fc3f7"/></g>')
    phone(d, 255, 60, 130, 150)

def ringlight(d):
    d.add(f'<g filter="url(#soft)"><line x1="320" y1="420" x2="320" y2="580" stroke="#333" stroke-width="14"/><line x1="320" y1="580" x2="230" y2="610" stroke="#333" stroke-width="10"/><line x1="320" y1="580" x2="410" y2="610" stroke="#333" stroke-width="10"/>'
          f'<circle cx="320" cy="260" r="150" fill="none" stroke="#fffbe6" stroke-width="40"/><circle cx="320" cy="260" r="150" fill="none" stroke="#ffe08a" stroke-width="6"/></g>')
    phone(d, 280, 190, 80, 150)

# --- রান্নাঘর ---
def container(d, x, y, w, h, fill_c, lid="#2e7d32", grains=None):
    d.add(f'<rect x="{x+6}" y="{y-24}" width="{w-12}" height="30" rx="8" fill="{d.grad(body(lid))}"/>'
          f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="14" fill="#e3f2fd" opacity=".75" stroke="#90caf9" stroke-width="3"/>'
          f'<rect x="{x+6}" y="{y+h*.3}" width="{w-12}" height="{h*.67}" rx="10" fill="{fill_c}"/>')
    if grains: d.add(pattern_rect(d, x + 6, y + h * .3, w - 12, h * .67, grains, fill_c))
    d.add(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="14" fill="url(#gloss)"/>')

def pattern_rect(d, x, y, w, h, kind, c):
    p = pattern(d, kind, c, shade(c, .8), shade(c, 1.2), .5)
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="10" fill="{p}"/>'

def chopper(d, c="#43a047", veg=True):
    d.add(f'<g filter="url(#soft)"><rect x="150" y="300" width="340" height="190" rx="24" fill="#e8f5e9" opacity=".85" stroke="#a5d6a7" stroke-width="4"/>'
          f'<rect x="140" y="260" width="360" height="60" rx="18" fill="{d.grad(body(c))}"/>'
          + "".join(f'<line x1="{170+k*30}" y1="300" x2="{170+k*30}" y2="480" stroke="#b0bec5" stroke-width="3"/>' for k in range(11)) + '</g>')
    if veg:
        for k in range(6): d.add(f'<circle cx="{190+k*45}" cy="{440+(k%2)*20}" r="18" fill="#7cb342" stroke="#c5e1a5" stroke-width="5"/>')

def push_chopper(d, c):
    d.add(f'<g filter="url(#soft)"><rect x="300" y="80" width="40" height="160" rx="10" fill="#b0bec5"/><circle cx="320" cy="80" r="44" fill="{d.grad(body(c))}"/>'
          f'<path d="M190 240 h260 l-20 270 h-220z" fill="#e3f2fd" opacity=".85" stroke="#90caf9" stroke-width="4"/><rect x="180" y="225" width="280" height="36" rx="10" fill="{d.grad(body(c))}"/></g>')
    for k in range(10): d.add(f'<rect x="{220+(k%5)*40}" y="{440+(k//5)*28}" width="22" height="16" rx="4" fill="#f8f4e3" stroke="#e0c3a0" stroke-width="2"/>')

def pull_chopper(d, c):
    d.add(f'<g filter="url(#soft)"><path d="M200 230 h240 v230 q0 50 -50 50 h-140 q-50 0 -50 -50z" fill="#e8f5e9" opacity=".85" stroke="#a5d6a7" stroke-width="4"/>'
          f'<rect x="190" y="190" width="260" height="56" rx="20" fill="{d.grad(body(c))}"/><path d="M450 210 q60 0 70 -60" stroke="#555" stroke-width="5" fill="none"/><rect x="505" y="110" width="34" height="50" rx="14" fill="{c}"/></g>')
    for k in range(14): d.add(f'<circle cx="{230+(k%7)*30}" cy="{430+(k//7)*28}" r="10" fill="{"#e53935" if k%3 else "#f5f5dc"}"/>')

def knife_block(d):
    d.add(f'<g filter="url(#soft)">' + "".join(f'<path d="M{230+k*36} {300-k*6} l18 -{160+k*12} q10 -20 14 0 l-6 {165+k*12}z" fill="#cfd8dc" stroke="#90a4ae" stroke-width="2"/><rect x="{224+k*36}" y="{280-k*6}" width="30" height="70" rx="6" fill="#222"/>' for k in range(5))
          + f'<path d="M180 330 h300 l-30 200 h-240z" fill="{d.grad(body("#6d4c41"))}"/></g>')

def utensils(d):
    d.add(f'<g filter="url(#soft)"><path d="M200 330 h240 l-20 200 h-200z" fill="{d.grad(body("#8d6e63"))}"/>')
    tools = [("#ef5350", "spoon"), ("#ffa726", "turner"), ("#66bb6a", "ladle"), ("#42a5f5", "whisk"), ("#ab47bc", "spoon")]
    for k, (c, t) in enumerate(tools):
        x = 230 + k * 45; r = -12 + k * 6
        d.add(f'<g transform="rotate({r} {x} 340)"><rect x="{x-7}" y="180" width="14" height="170" rx="7" fill="#a1887f"/>')
        if t == "spoon": d.add(f'<ellipse cx="{x}" cy="160" rx="28" ry="38" fill="{c}"/>')
        elif t == "turner": d.add(f'<rect x="{x-28}" y="110" width="56" height="74" rx="10" fill="{c}"/>')
        elif t == "ladle": d.add(f'<circle cx="{x}" cy="150" r="34" fill="{c}"/>')
        else: d.add(f'<ellipse cx="{x}" cy="140" rx="24" ry="48" fill="none" stroke="{c}" stroke-width="7"/>')
        d.add('</g>')
    d.add('</g>')

def oil_sprayer(d):
    d.add(f'<g filter="url(#soft)"><rect x="285" y="90" width="70" height="60" rx="12" fill="#212121"/><rect x="345" y="105" width="40" height="20" rx="6" fill="#212121"/>'
          f'<rect x="250" y="150" width="140" height="380" rx="40" fill="#fff8e1" opacity=".55" stroke="#ffe082" stroke-width="3"/><rect x="258" y="300" width="124" height="222" rx="34" fill="{d.grad(lin("#f9d423","#e8a600",True))}"/>'
          f'<rect x="250" y="150" width="140" height="380" rx="40" fill="url(#gloss)"/></g>')
    leaves(d, 430, 500, "#689f38", 3, .8)

def pan(d):
    d.add(f'<g filter="url(#soft)"><rect x="440" y="300" width="190" height="40" rx="20" fill="#3e2723" transform="rotate(-10 440 320)"/>'
          f'<ellipse cx="290" cy="340" rx="200" ry="150" fill="{d.grad(body("#37474f"))}"/><ellipse cx="290" cy="330" rx="170" ry="125" fill="{pattern(d,"dots","#263238","#37474f","#455a64",.25)}"/></g>')

def scale_(d):
    d.add(f'<g filter="url(#soft)"><rect x="150" y="330" width="340" height="150" rx="30" fill="{d.grad(body("#eceff1"))}"/>'
          f'<rect x="250" y="400" width="140" height="50" rx="8" fill="#0b132b"/><text x="320" y="438" font-family="B" font-size="34" fill="#2ee59d" text-anchor="middle">0.75kg</text></g>')
    fruit(d, 260, 290, "#e53935", 50); fruit(d, 370, 285, "#fb8c00", 46)

def spice_rack(d):
    d.add(f'<g filter="url(#soft)"><circle cx="320" cy="490" r="150" fill="{d.grad(body("#90a4ae"))}"/>')
    cols = ["#d84315", "#fbc02d", "#6d4c41", "#c62828", "#558b2f", "#ef6c00", "#8d6e63", "#f9a825"]
    for k, c in enumerate(cols):
        x = 160 + (k % 4) * 85; y = 160 + (k // 4) * 160
        d.add(f'<rect x="{x}" y="{y-20}" width="60" height="26" rx="6" fill="#455a64"/><rect x="{x}" y="{y}" width="60" height="120" rx="12" fill="#eceff1" opacity=".7"/><rect x="{x+4}" y="{y+30}" width="52" height="86" rx="10" fill="{c}"/>')
    d.add('</g>')

def dish_rack(d):
    d.add(f'<g filter="url(#soft)"><rect x="120" y="340" width="400" height="140" rx="18" fill="none" stroke="#9e9e9e" stroke-width="10"/>'
          + "".join(f'<line x1="{140+k*30}" y1="340" x2="{140+k*30}" y2="480" stroke="#bdbdbd" stroke-width="5"/>' for k in range(13))
          + "".join(f'<ellipse cx="{200+k*40}" cy="300" rx="22" ry="110" fill="{c}" stroke="#90a4ae" stroke-width="3"/>' for k, c in enumerate(["#fff", "#e3f2fd", "#fff", "#fce4ec"]))
          + f'<path d="M380 230 h80 l-10 120 h-60z" fill="#ffcc80"/><path d="M460 255 q30 10 0 50" stroke="#ffcc80" stroke-width="8" fill="none"/></g>')

def fridge_bins(d):
    d.add('<g filter="url(#soft)">')
    for k, (x, y, c) in enumerate([(130, 200, "#ef5350"), (330, 200, "#66bb6a"), (130, 360, "#ffa726"), (330, 360, "#fdd835")]):
        d.add(f'<rect x="{x}" y="{y}" width="180" height="140" rx="16" fill="#e3f2fd" opacity=".8" stroke="#90caf9" stroke-width="3"/>')
        for j in range(4): fruit(d, x + 40 + j * 34, y + 90 - (j % 2) * 20, c, 22, False)
    d.add('</g>')

def kettle(d):
    d.add(f'<g filter="url(#soft)"><path d="M220 210 h200 l30 300 h-260z" fill="{d.grad(body("#b0bec5"))}"/><path d="M420 240 q90 30 40 200" stroke="#37474f" stroke-width="26" fill="none"/>'
          f'<path d="M220 240 l-60 -50" stroke="#90a4ae" stroke-width="30" stroke-linecap="round"/><rect x="250" y="180" width="140" height="40" rx="14" fill="#37474f"/><rect x="180" y="505" width="280" height="30" rx="10" fill="#37474f"/></g>')

def hand_blender(d):
    d.add(f'<g filter="url(#soft)"><rect x="200" y="80" width="90" height="250" rx="40" fill="{d.grad(body("#eceff1"))}"/><rect x="235" y="320" width="20" height="160" fill="#b0bec5"/><path d="M215 480 h60 l-10 50 h-40z" fill="#90a4ae"/>'
          f'<path d="M360 330 h150 l-20 180 h-110z" fill="#e8f5e9" opacity=".85" stroke="#a5d6a7" stroke-width="4"/><ellipse cx="560" cy="250" rx="34" ry="80" fill="none" stroke="#b0bec5" stroke-width="8"/></g>')

def egg_beater(d):
    d.add(f'<g filter="url(#soft)"><path d="M140 250 h220 q30 0 30 40 v20 h-260z" fill="{d.grad(body("#f5f5f5"))}"/><ellipse cx="200" cy="370" rx="22" ry="70" fill="none" stroke="#b0bec5" stroke-width="6"/><ellipse cx="300" cy="370" rx="22" ry="70" fill="none" stroke="#b0bec5" stroke-width="6"/>'
          f'<path d="M140 470 q180 120 380 0 v20 q-200 100 -380 0z" fill="#e3f2fd"/><ellipse cx="330" cy="470" rx="190" ry="40" fill="#fffde7"/></g>')

def juice_blender(d):
    d.add(f'<g filter="url(#soft)"><rect x="240" y="120" width="160" height="320" rx="30" fill="#fff3e0" opacity=".6" stroke="#ffcc80" stroke-width="4"/><rect x="248" y="220" width="144" height="212" rx="24" fill="{d.grad(lin("#ffb74d","#f57c00",True))}"/>'
          f'<rect x="230" y="430" width="180" height="90" rx="20" fill="{d.grad(body("#ef6c00"))}"/><circle cx="320" cy="475" r="12" fill="#fff"/><rect x="270" y="90" width="100" height="40" rx="10" fill="#ef6c00"/></g>')
    orange_slice(d, 480, 480, 50)

def towels(d):
    d.add('<g filter="url(#soft)">')
    for k, c in enumerate(["#ef5350", "#42a5f5", "#66bb6a", "#ffca28", "#ab47bc"]):
        d.add(f'<rect x="{150+k*6}" y="{430-k*58}" width="340" height="62" rx="20" fill="{c}"/><rect x="{150+k*6}" y="{430-k*58}" width="340" height="62" rx="20" fill="{pattern(d,"check",c,shade(c,.8),None,.4)}" opacity=".5"/>')
    d.add('</g>')

def soap_disp(d):
    d.add(f'<g filter="url(#soft)"><rect x="300" y="110" width="40" height="70" fill="#9e9e9e"/><rect x="300" y="110" width="100" height="24" rx="8" fill="#9e9e9e"/>'
          f'<rect x="240" y="170" width="160" height="300" rx="30" fill="#e1f5fe" opacity=".8" stroke="#81d4fa" stroke-width="3"/><rect x="248" y="250" width="144" height="212" rx="24" fill="#4fc3f7" opacity=".8"/>'
          f'<rect x="200" y="460" width="300" height="60" rx="16" fill="{d.grad(body("#78909c"))}"/><rect x="400" y="400" width="120" height="70" rx="12" fill="#ffeb3b"/><rect x="400" y="440" width="120" height="30" rx="6" fill="#43a047"/></g>')

def gloves(d):
    for k, (x, r) in enumerate(((150, -10), (330, 12))):
        d.add(f'<g filter="url(#soft)" transform="rotate({r} {x+80} 330)"><path d="M{x} 520 v-190 q0 -30 22 -30 v-90 q0 -22 20 -22 q20 0 20 22 v80 v-110 q0 -22 20 -22 q20 0 20 22 v110 v-100 q0 -22 20 -22 q20 0 20 22 v100 v-70 q0 -22 20 -22 q20 0 20 22 v190 q0 40 -30 60 v60z" fill="{["#ec407a","#ab47bc"][k]}"/>'
              + "".join(f'<circle cx="{x+30+i*20}" cy="{330+j*18}" r="4" fill="#fff" opacity=".7"/>' for i in range(5) for j in range(4)) + '</g>')

# --- শিশু ---
def feeder(d, c, spoon=False):
    d.add('<g filter="url(#soft)">')
    if spoon: d.add(f'<rect x="300" y="80" width="40" height="60" fill="#ffccbc"/><ellipse cx="320" cy="80" rx="46" ry="30" fill="#ffab91"/>')
    else: d.add(f'<path d="M290 160 q0 -90 30 -90 q30 0 30 90z" fill="#ffe0b2" opacity=".9"/>')
    d.add(f'<rect x="250" y="150" width="140" height="50" rx="12" fill="{d.grad(body(c))}"/><rect x="235" y="195" width="170" height="330" rx="50" fill="#fff" opacity=".85" stroke="{shade(c,1.2)}" stroke-width="4"/>'
          f'<rect x="243" y="320" width="154" height="198" rx="44" fill="#fffdf5"/>' + "".join(f'<line x1="245" y1="{240+k*45}" x2="275" y2="{240+k*45}" stroke="{c}" stroke-width="4"/>' for k in range(6))
          + f'<circle cx="340" cy="270" r="16" fill="{shade(c,1.3)}"/></g>')

def feeding_set(d):
    d.add(f'<g filter="url(#soft)"><path d="M130 280 q60 -120 180 -120 q120 0 180 120 v160 q-180 90 -360 0z" fill="#f8bbd0"/><path d="M230 300 q80 70 160 0" fill="#fff" opacity=".6"/>'
          f'<path d="M180 470 q0 -100 140 -100 q140 0 140 100 q-140 60 -280 0z" fill="#b2dfdb"/><ellipse cx="320" cy="400" rx="130" ry="30" fill="#80cbc4"/>'
          f'<rect x="460" y="300" width="20" height="190" rx="10" fill="#ffe082" transform="rotate(20 470 400)"/><ellipse cx="500" cy="280" rx="26" ry="38" fill="#ffe082" transform="rotate(20 500 280)"/></g>')

def high_chair(d):
    d.add(f'<g filter="url(#soft)" stroke="#bdbdbd" stroke-width="16" stroke-linecap="round" fill="none"><path d="M220 360 l-60 220 M420 360 l60 220 M240 360 l-20 220 M400 360 l20 220"/></g>'
          f'<g filter="url(#soft)"><rect x="220" y="160" width="200" height="210" rx="40" fill="{d.grad(body("#90a4ae"))}"/><rect x="200" y="340" width="240" height="40" rx="14" fill="#eceff1"/><path d="M170 300 h300 v30 h-300z" fill="#fff" stroke="#cfd8dc" stroke-width="3"/></g>')

def romper(d, c, x, y, s=1, rot=0, kind="dots"):
    p = pattern(d, kind, c, shade(c, .8), "#fff", .5)
    d.add(f'<g transform="translate({x},{y}) scale({s}) rotate({rot})" filter="url(#soft)"><path d="M-60 -110 l-50 30 l25 50 l25 -15 v120 q0 30 25 40 l20 10 v-30 h30 v30 l20 -10 q25 -10 25 -40 v-120 l25 15 l25 -50 l-50 -30 q-60 40 -120 0z" fill="{p}"/>'
          f'<path d="M-60 -110 q60 40 120 0" stroke="{shade(c,.8)}" stroke-width="8" fill="none"/></g>')

def jacket(d):
    d.add(f'<g filter="url(#soft)"><circle cx="230" cy="130" r="34" fill="#ffcc80"/><circle cx="410" cy="130" r="34" fill="#ffcc80"/><path d="M220 170 q100 -120 200 0 v40 h-200z" fill="#ffb74d"/>'
          f'<path d="M200 210 h240 l70 70 l-40 50 l-30 -25 v200 h-240 v-200 l-30 25 l-40 -50z" fill="{d.grad(body("#ffb74d"))}"/><line x1="320" y1="210" x2="320" y2="505" stroke="#e65100" stroke-width="6"/>'
          + "".join(f'<circle cx="335" cy="{260+k*55}" r="7" fill="#e65100"/>' for k in range(5)) + '</g>')

def knit_set(d):
    c = "#f48fb1"; p = pattern(d, "stripe", c, "#fff", shade(c, .8), .4)
    d.add(f'<g filter="url(#soft)"><path d="M120 300 q0 -150 130 -150 q130 0 130 150z" fill="{p}"/><rect x="110" y="290" width="280" height="40" rx="14" fill="{shade(c,.85)}"/><circle cx="250" cy="140" r="26" fill="#fff"/>'
          f'<path d="M400 330 v130 q0 40 40 40 h60 q30 0 30 -30 q0 -30 -40 -30 h-40 v-110z" fill="{p}"/><path d="M180 400 h90 v90 q0 40 -45 40 q-45 0 -45 -40z" fill="{p}"/></g>')

def swaddle(d):
    for k, c in enumerate(["#b3e5fc", "#f8bbd0"]):
        p = pattern(d, ["dots", "leaf"][k], "#fffdf7", c, shade(c, .8), .6)
        d.add(f'<g filter="url(#soft)" transform="translate({k*40},{-k*80}) rotate({-4+k*8} 320 400)"><rect x="140" y="320" width="360" height="160" rx="16" fill="{p}"/></g>')

def shape_sorter(d):
    d.add(f'<g filter="url(#soft)"><rect x="170" y="240" width="300" height="240" rx="18" fill="{d.grad(body("#d7a86e"))}"/><circle cx="240" cy="300" r="26" fill="#6d4c41"/><rect x="295" y="275" width="50" height="50" fill="#6d4c41"/><polygon points="400,275 430,325 370,325" fill="#6d4c41"/></g>')
    for x, y, c, s in ((150, 520, "#e53935", "c"), (270, 540, "#1e88e5", "s"), (390, 530, "#fdd835", "t"), (500, 520, "#43a047", "c")):
        d.add(f'<circle cx="{x}" cy="{y}" r="32" fill="{c}"/>' if s == "c" else f'<rect x="{x-30}" y="{y-30}" width="60" height="60" fill="{c}"/>' if s == "s" else f'<polygon points="{x},{y-34} {x+36},{y+30} {x-36},{y+30}" fill="{c}"/>')

def rattles(d):
    for k, (x, y, c) in enumerate([(180, 260, "#ef5350"), (330, 220, "#42a5f5"), (470, 280, "#ffca28"), (250, 450, "#66bb6a"), (420, 460, "#ab47bc")]):
        d.add(f'<g filter="url(#soft)"><rect x="{x-8}" y="{y}" width="16" height="90" rx="8" fill="{shade(c,1.3)}"/><circle cx="{x}" cy="{y}" r="44" fill="{d.grad(body(c))}"/><circle cx="{x}" cy="{y+100}" r="18" fill="{c}"/></g>')

def teddy(d, c="#d7b899"):
    d.add(f'<g filter="url(#soft)"><circle cx="230" cy="150" r="46" fill="{c}"/><circle cx="410" cy="150" r="46" fill="{c}"/><circle cx="230" cy="150" r="24" fill="{shade(c,.85)}"/><circle cx="410" cy="150" r="24" fill="{shade(c,.85)}"/>'
          f'<ellipse cx="320" cy="420" rx="150" ry="140" fill="{c}"/><circle cx="320" cy="220" r="110" fill="{c}"/><ellipse cx="320" cy="255" rx="50" ry="38" fill="{shade(c,1.25)}"/><ellipse cx="320" cy="240" rx="16" ry="11" fill="#4e342e"/>'
          f'<circle cx="280" cy="200" r="11" fill="#3e2723"/><circle cx="360" cy="200" r="11" fill="#3e2723"/><ellipse cx="200" cy="470" rx="50" ry="40" fill="{c}"/><ellipse cx="440" cy="470" rx="50" ry="40" fill="{c}"/>'
          f'<path d="M270 320 q50 30 100 0 l-50 40z" fill="#e57373"/></g>')

def play_gym(d):
    d.add(f'<g filter="url(#soft)"><ellipse cx="320" cy="490" rx="260" ry="70" fill="{pattern(d,"dots","#b2dfdb","#80cbc4","#fff",.6)}"/>'
          f'<path d="M110 490 q210 -460 420 0" stroke="#ff8a65" stroke-width="20" fill="none"/><path d="M160 490 q160 -400 320 0" stroke="#4fc3f7" stroke-width="20" fill="none"/></g>')
    for k, c in enumerate(["#fdd835", "#ab47bc", "#66bb6a"]):
        x = 230 + k * 90; d.add(f'<line x1="{x}" y1="190" x2="{x}" y2="290" stroke="#999" stroke-width="3"/><circle cx="{x}" cy="310" r="24" fill="{c}"/>')

def carrier(d):
    d.add(f'<g filter="url(#soft)"><path d="M220 90 q-40 120 0 200 M420 90 q40 120 0 200" stroke="#546e7a" stroke-width="40" fill="none" stroke-linecap="round"/>'
          f'<path d="M200 230 h240 v190 q0 110 -120 110 q-120 0 -120 -110z" fill="{d.grad(body("#78909c"))}"/><rect x="180" y="400" width="280" height="50" rx="20" fill="#455a64"/><rect x="290" y="405" width="60" height="40" rx="8" fill="#cfd8dc"/></g>')

def diaper_bag(d):
    d.add(f'<g filter="url(#soft)"><path d="M250 150 q70 -90 140 0" stroke="#546e7a" stroke-width="24" fill="none"/><rect x="170" y="150" width="300" height="370" rx="60" fill="{d.grad(body("#90a4ae"))}"/>'
          f'<rect x="210" y="330" width="220" height="150" rx="30" fill="#78909c"/><rect x="455" y="300" width="60" height="140" rx="20" fill="#b0bec5"/><rect x="465" y="250" width="40" height="70" rx="10" fill="#fff"/></g>')

def stroller(d):
    d.add(f'<g filter="url(#soft)"><path d="M180 180 q130 -120 260 40 l-200 0z" fill="{d.grad(body("#546e7a"))}"/><path d="M180 220 h300 q0 160 -150 160 q-150 0 -150 -160z" fill="#78909c"/>'
          f'<path d="M480 220 l60 -110" stroke="#37474f" stroke-width="12"/><path d="M250 370 l-40 140 M420 370 l40 140" stroke="#37474f" stroke-width="12"/>'
          f'<circle cx="200" cy="520" r="44" fill="#263238"/><circle cx="200" cy="520" r="18" fill="#b0bec5"/><circle cx="470" cy="520" r="44" fill="#263238"/><circle cx="470" cy="520" r="18" fill="#b0bec5"/></g>')

def walker(d):
    d.add(f'<g filter="url(#soft)"><ellipse cx="320" cy="470" rx="230" ry="70" fill="#ff8a65"/><path d="M170 450 q150 -160 300 0" stroke="#ffcc80" stroke-width="18" fill="none"/>'
          f'<ellipse cx="320" cy="260" rx="200" ry="70" fill="{d.grad(body("#4fc3f7"))}"/><ellipse cx="320" cy="250" rx="90" ry="34" fill="#fff"/>'
          + "".join(f'<circle cx="{170+k*75}" cy="250" r="20" fill="{c}"/>' for k, c in enumerate(["#fdd835", "#ab47bc", "#fff", "#66bb6a", "#ef5350"]) if k != 2)
          + "".join(f'<circle cx="{x}" cy="530" r="20" fill="#455a64"/>' for x in (130, 250, 390, 510)) + '</g>')

def bathtub(d):
    d.add(f'<g filter="url(#soft)"><path d="M100 300 h440 q0 220 -220 220 q-220 0 -220 -220z" fill="{d.grad(body("#81d4fa"))}"/><rect x="90" y="285" width="460" height="34" rx="16" fill="#4fc3f7"/></g>')
    for k in range(9): d.add(f'<circle cx="{150+k*45}" cy="{260-(k%3)*20}" r="{18+(k%2)*8}" fill="#fff" opacity=".9"/>')
    d.add('<g transform="translate(400,190)"><ellipse cx="0" cy="40" rx="40" ry="28" fill="#fdd835"/><circle cx="-14" cy="0" r="24" fill="#fdd835"/><path d="M-36 0 l-22 8 l22 6z" fill="#fb8c00"/><circle cx="-18" cy="-6" r="4" fill="#333"/></g>')

def hooded_towel(d):
    d.add(f'<g filter="url(#soft)"><path d="M140 300 h360 v200 q0 30 -30 30 h-300 q-30 0 -30 -30z" fill="{pattern(d,"plain","#fafafa","#eee")}" stroke="#e0e0e0" stroke-width="3"/>'
          f'<path d="M220 300 q100 -200 200 0z" fill="#f5f5f5" stroke="#e0e0e0" stroke-width="3"/><circle cx="250" cy="170" r="30" fill="#f5f5f5" stroke="#e0e0e0" stroke-width="3"/><circle cx="390" cy="170" r="30" fill="#f5f5f5" stroke="#e0e0e0" stroke-width="3"/>'
          f'<rect x="140" y="470" width="360" height="20" fill="#b3e5fc"/></g>')

def nail_kit(d):
    d.add(f'<g filter="url(#soft)"><rect x="140" y="170" width="360" height="330" rx="30" fill="#e1f5fe"/><rect x="160" y="190" width="320" height="290" rx="22" fill="#fff"/>'
          f'<rect x="190" y="220" width="40" height="230" rx="18" fill="#81d4fa"/><rect x="260" y="220" width="30" height="230" rx="12" fill="#f48fb1"/><rect x="320" y="240" width="110" height="40" rx="18" fill="#a5d6a7"/>'
          f'<circle cx="375" cy="360" r="42" fill="#ffe082"/><rect x="330" y="410" width="90" height="30" rx="12" fill="#ce93d8"/></g>')

def baby_bed(d):
    d.add(f'<g filter="url(#soft)"><path d="M320 80 l-220 360 h440z" fill="#e1f5fe" opacity=".55" stroke="#b3e5fc" stroke-width="3"/>'
          f'<rect x="110" y="400" width="420" height="110" rx="20" fill="{d.grad(body("#b39ddb"))}"/><rect x="130" y="380" width="380" height="40" rx="16" fill="#ede7f6"/><circle cx="320" cy="80" r="12" fill="#9575cd"/></g>')

# ---------- নিশ → পণ্য আঁকা ----------
def draw_product(key, i, name):
    d = D()
    S = {}
    if key == "sutokotha":
        spec = [("#f9c5d5", "#e75480", "floral"), ("#cfe8ff", "#3a86ff", "paisley"), ("#fff3b0", "#f4a261", "floral"), ("#c7f9cc", "#2d6a4f", "leaf"),
                ("#800f2f", "#ffd6a5", "paisley", 1), ("#ffffff", "#adb5bd", "jacquard", 1), ("#1b4332", "#95d5b2", "leaf", 1), ("#ffd7ba", "#e76f51", "floral", 1),
                ("#1d3557", "#d4a017", "sequin", 2), ("#e9c46a", "#b5838d", "jacquard", 2), ("#111111", "#d4a017", "paisley", 2), ("#ff8fab", "#fff", "sequin", 2),
                ("#fdfcdc", "#0081a7", "paisley"), ("#f77f00", "#fcbf49", "stripe"), ("#cdb4db", "#7b2cbf", "jacquard"), ("#bc6c25", "#fefae0", "check")]
        if i < 16:
            s = spec[i]; lvl = s[3] if len(s) > 3 else 0
            fabric_set(d, s[0], s[1], s[2], shade(s[0], 1.35) if s[0] != "#ffffff" else "#f1f3f5", shade(s[0], .75) if s[0] not in ("#ffffff",) else "#dee2e6", gold=lvl == 2, embroid=lvl >= 1)
        else:
            k = [("#1d3557", "#a8dadc", "floral"), ("#2a9d8f", "#e9c46a", "leaf"), ("#ffc8dd", "#ff8fab", "dots"), ("#e9c46a", "#bc6c25", "paisley")][i - 16]
            kurti(d, *k)
        bg = "#f3e6da"
    elif key == "tokmaya":
        bg = ["#e8f6f3", "#e7f0fb", "#fde8ef", "#fdeee4", "#fdf1e3", "#f2f2f2", "#e6f0fb", "#e9f6ec", "#f1f1f1", "#f6f0e6", "#f3f3f3", "#eef6fb", "#f6f1ea", "#e8f1fb", "#f2f2f2", "#fde8ef", "#f3efe6", "#eef6ee", "#f6efe6", "#fde8ef"][i]
        f = [
            lambda: tube(d, "#ffffff", "#2a9d8f", "SPF50+", "সান জেল"), lambda: tube(d, "#f8f9fa", "#4361ee", "SPF50", "অয়েল কন্ট্রোল"),
            lambda: tube(d, "#ffc2d1", "#ff8fab", "TONE UP", "সান ক্রিম"), lambda: stick(d, "#ffd6a5", "SUN"),
            lambda: dropper(d, "#c26a17", "Vit C", "১৩% সিরাম", lambda d: orange_slice(d, 480, 470)), lambda: dropper(d, "#a8dadc", "B3 10%", "নিয়াসিনামাইড"),
            lambda: dropper(d, "#4895ef", "HA", "হায়ালুরোনিক"), lambda: dropper(d, "#52b788", "CICA", "সেন্টেলা", lambda d: leaves(d, 470, 500, "#52b788")),
            lambda: tube(d, "#e9ecef", "#6c757d", "pH 5.5", "জেল ক্লেনজার"), lambda: tube(d, "#fffaf0", "#bc8a5f", "RICE", "ফোম ক্লেনজার"),
            lambda: bottle(d, "#f9c74f", "#495057", "OIL", "ক্লেনজিং", pump=True), lambda: bottle(d, "#dff3ff", "#4cc9f0", "MICELLAR", "৩০০ml", tall=True),
            lambda: jar(d, "#fdfdfd", "#adb5bd", "CERAMIDE", "ক্রিম", cream="#ffffff"), lambda: jar(d, "#bde0fe", "#4895ef", "AQUA GEL", "ময়েশ্চারাইজার"),
            lambda: jar(d, "#f8f9fa", "#b5838d", "SNAIL", "রিপেয়ার ক্রিম", cream="#fff"), lambda: jar(d, "#ffafcc", "#ff4d6d", "LIP", "স্লিপিং মাস্ক"),
            lambda: (leaves(d, 150, 520, "#40916c", 3), bottle(d, "#bc6c25", "#283618", "ROSEMARY", "হেয়ার অয়েল")),
            lambda: (leaves(d, 470, 520, "#74c69d", 3), bottle(d, "#ffffff", "#2d6a4f", "SHAMPOO", "৩০০ml", pump=True)),
            lambda: jar(d, "#ffe5d9", "#9d8189", "HAIR MASK", "২০০ml", wide=True), None,
        ][i]
        if f: f()
        else:  # কম্বো
            for dx, fn in ((-150, lambda: tube(d, "#e9ecef", "#6c757d", "CLEAN", "", x=110, w=130, h=280, y=200, rot=-6)),
                           (0, lambda: None), (150, lambda: tube(d, "#ffffff", "#2a9d8f", "SPF", "", x=400, w=130, h=280, y=200, rot=6))): fn()
            d.add('<g transform="translate(0,20) scale(.9) translate(35,0)">'); dropper(d, "#c26a17", "Vit C", ""); d.add('</g>')
    elif key == "khatibari":
        bg = "#f1e4cf"
        def honey(c, t, s, deco): deco(); jar(d, c, "#d4a017", t, s)
        f = [
            lambda: honey("#e8a317", "খলিশা", "সুন্দরবনের মধু", lambda: honeycomb(d, 450, 450)),
            lambda: honey("#f2d27a", "সরিষা", "ফুলের মধু", lambda: flowers(d, 440, 520)),
            lambda: honey("#d98e04", "লিচু", "ফুলের মধু", lambda: [fruit(d, 490, 480, "#d62828", 36), fruit(d, 540, 520, "#c1121f", 30, False)]),
            lambda: honey("#7f4f24", "কালোজিরা", "ফুলের মধু", lambda: bowl_small(d, 500, 500, "#222")),
            lambda: jar(d, "#f6d365", "#b08968", "গাওয়া ঘি", "১ কেজি", wide=True), lambda: jar(d, "#f9dc8c", "#b08968", "গাওয়া ঘি", "৫০০ গ্রাম"),
            lambda: (seeds_pile(d, 470, 520, "#c9a227"), bottle(d, "#e9c46a", "#bc6c25", "সরিষার তেল", "২ লিটার")),
            lambda: (coconut(d, 470, 470), bottle(d, "#f8f9fa", "#2d6a4f", "নারিকেল তেল", "৫০০ml")),
            lambda: bowl(d, date_item("#3b1f14"), "#5d4037", 28, 1), lambda: bowl(d, date_item("#6f3d20"), "#b08968", 20, 2),
            lambda: bowl(d, date_item("#c68b3e"), "#8d6e63", 26, 3), lambda: bowl(d, date_item("#4a2511"), "#a1887f", 24, 4),
            lambda: (jar(d, "#d98e04", "#7f5539", "হানি নাট", "৫০০ গ্রাম"), nut_dots(d)),
            lambda: bowl(d, nut_item("#c58b4f"), "#6d4c41", 40, 5), lambda: bowl(d, cashew_item("#f1e3c6"), "#5d4037", 30, 6),
            lambda: bowl(d, mix_item(["#f4a261", "#9c6644", "#e63946", "#90be6d", "#6d597a"]), "#7f5539", 40, 7),
            lambda: bowl(d, seed_item("#6c757d"), "#e9ecef", 120, 8), lambda: bowl(d, seed_item("#111"), "#a47148", 120, 9),
            lambda: jaggery(d), lambda: combo_food(d),
        ][i]
        f()
    elif key == "gadgetpara":
        bg = ["#e3eaf5", "#eef1f5", "#e2e6f3", "#fde8ef", "#e3eaf5", "#eef1f5", "#fbe9ef", "#e3eaf5", "#e3eaf5", "#eef1f5", "#ece3f5", "#e3eaf5",
              "#e3eaf5", "#eef1f5", "#eef1f5", "#e3eaf5", "#e3eaf5", "#eef1f5", "#eef1f5", "#e3eaf5"][i]
        [lambda: earbuds(d, "#2b2d42"), lambda: earbuds(d, "#f8f9fa", "#4361ee"), lambda: earbuds(d, "#14213d", "#ff006e", True), lambda: earbuds(d, "#ffafcc", "#fff"),
         lambda: watch(d, "#2b2d42", "#14213d"), lambda: watch(d, "#ced4da", "#adb5bd", True), lambda: watch(d, "#e5989b", "#f4acb7", False, "#3d0814", True), lambda: band(d, "#212529"),
         lambda: neckband(d, "#212529"), lambda: headphones(d, "#2b2d42"), lambda: headphones(d, "#212529", "#8338ec"), lambda: speaker(d, "#3a86ff"),
         lambda: powerbank(d, "#212529"), lambda: powerbank(d, "#f8f9fa", True), lambda: charger(d, "#f8f9fa"), lambda: charger(d, "#212529", True),
         lambda: cable(d, "#495057"), lambda: stand(d), lambda: selfie(d), lambda: ringlight(d)][i]()
    elif key == "rannaghor":
        bg = "#eaf4ec" if i % 2 else "#f4efe6"
        [lambda: chopper(d), lambda: push_chopper(d, "#e53935"), lambda: pull_chopper(d, "#43a047"), lambda: knife_block(d),
         lambda: utensils(d), lambda: oil_sprayer(d), lambda: pan(d), lambda: scale_(d),
         lambda: containers_set(d), lambda: spice_rack(d), lambda: dish_rack(d), lambda: fridge_bins(d),
         lambda: kettle(d), lambda: hand_blender(d), lambda: egg_beater(d), lambda: juice_blender(d),
         lambda: towels(d), lambda: soap_disp(d), lambda: gloves(d), lambda: kitchen_combo(d)][i]()
    elif key == "chhottosona":
        bg = ["#e3f2fd", "#fff3e0", "#fce4ec", "#eceff1", "#fff8e1", "#fff3e0", "#fce4ec", "#e8f5e9", "#fff8e1", "#ede7f6", "#fbe9e7", "#e0f2f1",
              "#eceff1", "#e3f2fd", "#eceff1", "#fff3e0", "#e1f5fe", "#f3e5f5", "#e3f2fd", "#ede7f6"][i]
        [lambda: feeder(d, "#4fc3f7"), lambda: feeder(d, "#ff8a65", True), lambda: feeding_set(d), lambda: high_chair(d),
         lambda: [romper(d, "#b3e5fc", 210, 340, .9, -8), romper(d, "#f8bbd0", 330, 320, .9, 0, "floral"), romper(d, "#fff59d", 450, 340, .9, 8, "stripe")],
         lambda: jacket(d), lambda: knit_set(d), lambda: swaddle(d),
         lambda: shape_sorter(d), lambda: rattles(d), lambda: teddy(d), lambda: play_gym(d),
         lambda: carrier(d), lambda: diaper_bag(d), lambda: stroller(d), lambda: walker(d),
         lambda: bathtub(d), lambda: hooded_towel(d), lambda: nail_kit(d), lambda: baby_bed(d)][i]()
    return bg, d.svg()

# ছোট সহায়ক (উপরের তালিকায় ব্যবহার)
def bowl_small(d, x, y, c):
    d.add(f'<ellipse cx="{x}" cy="{y}" rx="60" ry="18" fill="{shade(c,.8)}"/>' + "".join(f'<circle cx="{x-40+k*9}" cy="{y-6+(k%3)*4}" r="4" fill="{c}"/>' for k in range(10))
          + f'<path d="M{x-60} {y} q0 50 60 50 q60 0 60 -50z" fill="#a47148"/>')
def seeds_pile(d, x, y, c):
    random.seed(3)
    for k in range(60): d.add(f'<circle cx="{x+random.uniform(-70,70)}" cy="{y+random.uniform(-14,10)}" r="5" fill="{shade(c, random.uniform(.8,1.2))}"/>')
def coconut(d, x, y):
    d.add(f'<circle cx="{x}" cy="{y}" r="70" fill="#6d4c41"/><circle cx="{x}" cy="{y}" r="56" fill="#fafafa"/>')
def nut_dots(d):
    random.seed(4)
    for k in range(18): d.add(f'<ellipse cx="{220+random.uniform(0,200)}" cy="{250+random.uniform(0,40)}" rx="14" ry="9" fill="{random.choice(["#c58b4f","#f1e3c6","#9c6644"])}" opacity=".9"/>')
def jaggery(d):
    d.add('<g filter="url(#soft)"><ellipse cx="320" cy="430" rx="250" ry="90" fill="#7cb342"/><path d="M90 430 q230 -120 460 0" fill="#9ccc65"/></g>')
    for x, y in ((230, 380), (360, 370), (290, 300), (420, 300)):
        d.add(f'<g filter="url(#soft)"><ellipse cx="{x}" cy="{y+30}" rx="70" ry="24" fill="#6d3a12"/><rect x="{x-70}" y="{y-10}" width="140" height="40" fill="#8b4513"/><ellipse cx="{x}" cy="{y-10}" rx="70" ry="24" fill="#a0522d"/></g>')
def combo_food(d):
    d.add('<g transform="translate(-110,40) scale(.75)">'); jar(d, "#e8a317", "#d4a017", "মধু", ""); d.add('</g>')
    d.add('<g transform="translate(150,40) scale(.75)">'); jar(d, "#f6d365", "#b08968", "ঘি", ""); d.add('</g>')
    d.add(f'<g filter="url(#soft)"><rect x="200" y="470" width="240" height="90" rx="12" fill="#7f5539"/><text x="320" y="527" font-family="B" font-size="34" fill="#fff" text-anchor="middle">খেজুর</text></g>')
    d.add('<path d="M190 470 h260" stroke="#c9a227" stroke-width="10"/>')
def containers_set(d):
    d.add('<g filter="url(#soft)">')
    for k, (x, y, w, h, c, g) in enumerate([(110, 260, 130, 250, "#fff8e1", "dots"), (255, 220, 130, 290, "#ffcc80", "dots"), (400, 260, 130, 250, "#d7ccc8", "jacquard")]):
        container(d, x, y, w, h, c, "#2e7d32", g)
    d.add('</g>')
def kitchen_combo(d):
    d.add('<g transform="translate(-120,40) scale(.7)">'); chopper(d); d.add('</g>')
    d.add('<g transform="translate(250,30) scale(.7)">'); oil_sprayer(d); d.add('</g>')
    d.add('<g transform="translate(170,250) scale(.55)">'); containers_set(d); d.add('</g>')

# ---------- ব্যানার ----------
def draw_banner(shop, n):
    """১৬০০×৬০০: বাঁয়ে লেখা, ডানে ৩টা পণ্য"""
    prim = shop["colors"]["primary"]; acc = shop["colors"]["accent"]
    heads = {
        "sutokotha": [("নতুন লন কালেকশন", "পাকিস্তানি স্টাইলের থ্রি-পিস — সারাদেশে ক্যাশ অন ডেলিভারি"), ("এমব্রয়ডারি স্পেশাল", "হাতের কাজের নকশা, আরামদায়ক কাপড়"), ("পার্টি ওয়্যার", "উৎসবের জন্য শিফন, অর্গাঞ্জা আর ভেলভেট")],
        "tokmaya": [("রোদে সুরক্ষা প্রতিদিন", "হালকা সানস্ক্রিন, গরমেও তেলতেলে নয়"), ("উজ্জ্বল ত্বকের সিরাম", "ভিটামিন সি, নিয়াসিনামাইড, হায়ালুরোনিক"), ("কোরিয়ান রুটিন কম্বো", "ক্লেনজার + সিরাম + সানস্ক্রিন একসাথে")],
        "khatibari": [("খাঁটি মধু, সরাসরি উৎস থেকে", "সুন্দরবন, সরিষা, লিচু আর কালোজিরা ফুলের মধু"), ("প্রিমিয়াম খেজুর", "আজওয়া, মেডজুল, সুক্কারি, মাবরুম"), ("গাওয়া ঘি আর ঘানি ভাঙা তেল", "ভেজালমুক্ত, স্বাদে-গন্ধে খাঁটি")],
        "gadgetpara": [("ইয়ারবাড মেলা", "ENC আর ANC ইয়ারবাড — বাজেটের মধ্যে"), ("স্মার্টওয়াচ কালেকশন", "কলিং, হার্ট রেট, ফিটনেস ট্র্যাকিং"), ("চার্জ শেষ? চিন্তা নেই", "পাওয়ার ব্যাংক, ফাস্ট চার্জার আর কেবল")],
        "rannaghor": [("রান্না হোক সহজ", "কাটাকাটি থেকে রান্না — সব গ্যাজেট এক জায়গায়"), ("কাটাকাটি এক মিনিটে", "ভেজিটেবল কাটার আর চপার"), ("গোছানো রান্নাঘর", "কন্টেইনার, স্পাইস র‍্যাক আর অর্গানাইজার")],
        "chhottosona": [("সোনামণির জন্য সেরাটা", "নিরাপদ আর আরামের শিশু পণ্য"), ("খাওয়ানোর সব কিছু", "ফিডার, ফিডিং সেট আর চেয়ার"), ("খেলনা আর আনন্দ", "শেখার খেলনা, টেডি আর প্লে জিম")],
    }[shop["key"]][n - 1]
    picks = {1: [0, 1, 2], 2: [4, 5, 6], 3: [8, 12, 16]}
    ids = picks[n] if shop["key"] != "khatibari" else {1: [0, 1, 3], 2: [8, 9, 10], 3: [4, 6, 18]}[n]
    if shop["key"] == "tokmaya": ids = {1: [0, 1, 3], 2: [4, 5, 6], 3: [8, 4, 0]}[n]
    if shop["key"] == "chhottosona": ids = {1: [10, 4, 0], 2: [0, 2, 3], 3: [8, 10, 11]}[n]
    if shop["key"] == "rannaghor": ids = {1: [0, 5, 12], 2: [0, 1, 2], 3: [8, 9, 11]}[n]
    if shop["key"] == "gadgetpara": ids = {1: [0, 1, 2], 2: [4, 5, 6], 3: [12, 14, 13]}[n]
    items = []
    for k, i in enumerate(ids):
        _, svg = draw_product(shop["key"], i, "")
        inner = svg.split(">", 1)[1].rsplit("</svg>", 1)[0]  # <defs>…</defs> + আঁকা
        items.append(inner)
    g1 = f'<linearGradient id="bb" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="{shade(prim,1.85)}"/><stop offset="1" stop-color="{shade(acc,1.55)}"/></linearGradient>'
    parts = [f'<rect width="1600" height="600" fill="url(#bb)"/>',
             f'<circle cx="1250" cy="300" r="330" fill="{shade(prim,1.6)}" opacity=".6"/><circle cx="1500" cy="80" r="120" fill="{shade(acc,1.4)}" opacity=".5"/><circle cx="80" cy="560" r="140" fill="{shade(prim,1.5)}" opacity=".45"/>',
             f'<text x="90" y="250" font-family="B" font-size="76" font-weight="800" fill="{shade(prim,.75)}">{heads[0]}</text>',
             f'<text x="92" y="320" font-family="H" font-size="32" fill="#333">{heads[1]}</text>',
             f'<rect x="90" y="370" width="250" height="70" rx="35" fill="{prim}"/><text x="215" y="416" font-family="B" font-size="32" fill="#fff" text-anchor="middle">এখনই কিনুন →</text>']
    for k, inner in enumerate(items):
        x = 780 + k * 240; y = 60 if k == 1 else 140; s = .66 if k == 1 else .56
        parts.append(f'<g transform="translate({x},{y}) scale({s})">{inner}</g>')
    return f'<svg width="1600" height="600" viewBox="0 0 1600 600" xmlns="http://www.w3.org/2000/svg"><defs>{g1}</defs>{"".join(parts)}</svg>'

HTML = """<html><head><style>
@font-face{font-family:B;src:url(file://%s/fontsource-baloo-da-2-5.3.0/files/baloo-da-2-bengali-700-normal.woff2)}
@font-face{font-family:H;src:url(file://%s/fontsource-hind-siliguri-5.3.0/files/hind-siliguri-bengali-600-normal.woff2)}
html,body{margin:0}</style></head><body>%%s</body></html>""" % (FONTS, FONTS)

def product_page(bg, svg):
    return HTML % (f'<div id="c" style="width:800px;height:800px;background:radial-gradient(circle at 50%% 38%%,#fff 0%%,{bg} 72%%);display:grid;place-items:center;position:relative;overflow:hidden">'
                   f'<div style="position:absolute;bottom:105px;left:50%%;transform:translateX(-50%%);width:560px;height:70px;background:radial-gradient(ellipse,rgba(0,0,0,.18),transparent 70%%)"></div>{svg}</div>'.replace("%%", "%"))

async def main(keys):
    async with async_playwright() as p:
        br = await p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
        pg = await br.new_page(viewport={"width": 1600, "height": 800})
        for shop in SHOPS:
            if keys and shop["key"] not in keys: continue
            for i, pr in enumerate(shop["products"]):
                bg, svg = draw_product(shop["key"], i, pr["name"])
                await pg.set_content(product_page(bg, svg)); await pg.wait_for_timeout(60)
                await pg.locator("#c").screenshot(path=str(OUT / f'{shop["key"]}-{i+1:02d}.jpg'), type="jpeg", quality=86)
            for n in (1, 2, 3):
                await pg.set_content(HTML % f'<div id="c" style="width:1600px;height:600px">{draw_banner(shop, n)}</div>'); await pg.wait_for_timeout(80)
                await pg.locator("#c").screenshot(path=str(OUT / f'{shop["key"]}-banner-{n}.jpg'), type="jpeg", quality=86)
            print("✓", shop["key"])
        await br.close()

asyncio.run(main(sys.argv[1:]))
