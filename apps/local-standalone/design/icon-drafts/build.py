"""生成三版候选图标（SVG 内联 HTML），供无头 Chrome 截图成 PNG。

只做草稿，不进 src：产物放在 design/icon-drafts/ 下，确认后再接入 Tauri / PWA。
"""

import os

OUT = os.path.dirname(os.path.abspath(__file__))

DAY = "#9ed3ef"
NIGHT = "#26374b"
REST = "#7fce9f"
ACCENT = "#1b6c80"
RIM = "#e6eaec"

# 4F：夜×4 休×2 夜×4 休×2 白×4 休×2 白×4 休×2 → 夜8 / 休8 / 白8
P4F = ["夜"] * 4 + ["休"] * 2 + ["夜"] * 4 + ["休"] * 2 + \
      ["白"] * 4 + ["休"] * 2 + ["白"] * 4 + ["休"] * 2
COLOR = {"白": DAY, "夜": NIGHT, "休": REST}


def tile(inner: str, bg: str = "#ffffff", rim: bool = True) -> str:
    """圆角方块底：1024 画布，22.5% 圆角；1px 内描边保证浅色任务栏上也看得见边界"""
    stroke = f'stroke="{RIM}" stroke-width="2"' if rim else ""
    return f"""
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <rect x="1" y="1" width="1022" height="1022" rx="231" fill="{bg}" {stroke}/>
  {inner}
</svg>"""


# ── A. 日历页：强调色抬头 + 3×3 格，对角三格上色（暗示轮换） ─────────
def icon_a() -> str:
    clip = '<clipPath id="page"><rect x="1" y="1" width="1022" height="1022" rx="231"/></clipPath>'
    head = f'<rect x="0" y="0" width="1024" height="208" fill="{ACCENT}" clip-path="url(#page)"/>'
    rings = "".join(
        f'<rect x="{x}" y="70" width="22" height="68" rx="11" fill="#ffffff" opacity="0.5"/>'
        for x in (392, 610)
    )
    cell, gap, x0, y0 = 184, 36, 200, 300
    filled = {(0, 0): DAY, (1, 1): NIGHT, (2, 2): REST}
    cells = []
    for row in range(3):
        for col in range(3):
            cx = x0 + col * (cell + gap)
            cy = y0 + row * (cell + gap)
            fill = filled.get((row, col), "#eef1f3")
            cells.append(f'<rect x="{cx}" y="{cy}" width="{cell}" height="{cell}" rx="40" fill="{fill}"/>')
    return tile(clip + head + rings + "".join(cells))


# ── B. 24 段环：按 4F 的节奏着色 ──────────────────────────────────────
def icon_b() -> str:
    cx = cy = 512
    r_outer, r_inner = 400, 262
    half = 28
    ticks = []
    for i, kind in enumerate(P4F):
        angle = i * 15
        ticks.append(
            f'<rect x="{cx - half}" y="{cy - r_outer}" width="{half * 2}" height="{r_outer - r_inner}" '
            f'rx="{half}" fill="{COLOR[kind]}" transform="rotate({angle} {cx} {cy})"/>'
        )
    hub = f'<circle cx="{cx}" cy="{cy}" r="112" fill="{ACCENT}"/>'
    hub_dot = '<circle cx="512" cy="512" r="40" fill="#ffffff" opacity="0.28"/>'
    return tile("".join(ticks) + hub + hub_dot)


# ── C. 字符标：「班」 ──────────────────────────────────────────────────
def icon_c() -> str:
    text = (
        '<text x="512" y="512" fill="#ffffff" font-family="Microsoft YaHei, PingFang SC, sans-serif" '
        'font-size="520" font-weight="700" text-anchor="middle" dominant-baseline="central" '
        'letter-spacing="0">班</text>'
    )
    return tile(text, bg=ACCENT, rim=False)


# ── B2. 24 环的另一种画法：8 段圆环（按 4F 的真实配比切分） ───────────
def icon_b2() -> str:
    import math
    cx = cy = 512
    r, width = 322, 148
    blocks = [("夜", 60), ("休", 30), ("夜", 60), ("休", 30), ("白", 60), ("休", 30), ("白", 60), ("休", 30)]
    segs = []
    cursor = -90.0
    for kind, span in blocks:
        gap = 2.6
        start, end = cursor + gap / 2, cursor + span - gap / 2
        def pt(deg):
            rad = math.radians(deg)
            return cx + r * math.cos(rad), cy + r * math.sin(rad)
        x1, y1 = pt(start)
        x2, y2 = pt(end)
        large = 1 if (end - start) > 180 else 0
        segs.append(f'<path d="M {x1:.1f} {y1:.1f} A {r} {r} 0 {large} 1 {x2:.1f} {y2:.1f}" '
                    f'fill="none" stroke="{COLOR[kind]}" stroke-width="{width}"/>')
        cursor += span
    hub = f'<circle cx="{cx}" cy="{cy}" r="118" fill="{ACCENT}"/>'
    hub_dot = '<circle cx="512" cy="512" r="44" fill="#ffffff" opacity="0.28"/>'
    return tile("".join(segs) + hub + hub_dot)


# ── B3. b2 的优化版：环加粗、缺口加大、去掉中心那点浮灰 ───────────────
def icon_b3() -> str:
    import math
    cx = cy = 512
    r, width = 318, 170          # 环心半径 318 + 厚度 170 → 外 403 / 内 233
    gap_deg = 3.4                # 断口比 b2 的 2.6° 更宽，32px 下八段才分得开
    blocks = [("夜", 60), ("休", 30), ("夜", 60), ("休", 30), ("白", 60), ("休", 30), ("白", 60), ("休", 30)]
    segs = []
    cursor = -90.0
    for kind, span in blocks:
        start, end = cursor + gap_deg / 2, cursor + span - gap_deg / 2
        def pt(deg):
            rad = math.radians(deg)
            return cx + r * math.cos(rad), cy + r * math.sin(rad)
        x1, y1 = pt(start)
        x2, y2 = pt(end)
        large = 1 if (end - start) > 180 else 0
        segs.append(f'<path d="M {x1:.1f} {y1:.1f} A {r} {r} 0 {large} 1 {x2:.1f} {y2:.1f}" '
                    f'fill="none" stroke="{COLOR[kind]}" stroke-width="{width}"/>')
        cursor += span
    hub = f'<circle cx="{cx}" cy="{cy}" r="104" fill="{ACCENT}"/>'
    return tile("".join(segs) + hub)


# ── C. 圆形图标（用户要「像 Chrome 那种」） ───────────────────────────
def circle_bg(inner: str) -> str:
    """圆形底：1024 画布内画满圆，圆外透明（不再用圆角方块）"""
    return f"""
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  {inner}
</svg>"""


def icon_c1() -> str:
    """C1 保守版：白色圆底 + b3 的环（环内留白当呼吸）"""
    import math
    cx = cy = 512
    r, width, gap_deg = 306, 168, 3.4
    blocks = [("夜", 60), ("休", 30), ("夜", 60), ("休", 30), ("白", 60), ("休", 30), ("白", 60), ("休", 30)]
    segs = ['<circle cx="512" cy="512" r="512" fill="#ffffff"/>']
    cursor = -90.0
    for kind, span in blocks:
        start, end = cursor + gap_deg / 2, cursor + span - gap_deg / 2
        def pt(deg):
            rad = math.radians(deg)
            return cx + r * math.cos(rad), cy + r * math.sin(rad)
        x1, y1 = pt(start)
        x2, y2 = pt(end)
        large = 1 if (end - start) > 180 else 0
        segs.append(f'<path d="M {x1:.1f} {y1:.1f} A {r} {r} 0 {large} 1 {x2:.1f} {y2:.1f}" '
                    f'fill="none" stroke="{COLOR[kind]}" stroke-width="{width}"/>')
        cursor += span
    segs.append(f'<circle cx="{cx}" cy="{cy}" r="104" fill="{ACCENT}"/>')
    return circle_bg("".join(segs))


def icon_c2() -> str:
    """C2 接近 Chrome：八个扇形直接铺到圆边，再压一圈白环 + 中心实心点"""
    import math
    cx = cy = 512
    R, gap_deg = 512, 1.4
    blocks = [("夜", 60), ("休", 30), ("夜", 60), ("休", 30), ("白", 60), ("休", 30), ("白", 60), ("休", 30)]
    segs = []
    cursor = -90.0
    for kind, span in blocks:
        start, end = cursor + gap_deg / 2, cursor + span - gap_deg / 2
        def pt(deg):
            rad = math.radians(deg)
            return cx + R * math.cos(rad), cy + R * math.sin(rad)
        x1, y1 = pt(start)
        x2, y2 = pt(end)
        large = 1 if (end - start) > 180 else 0
        segs.append(f'<path d="M {cx} {cy} L {x1:.1f} {y1:.1f} A {R} {R} 0 {large} 1 {x2:.1f} {y2:.1f} Z" '
                    f'fill="{COLOR[kind]}"/>')
        cursor += span
    segs.append(f'<circle cx="{cx}" cy="{cy}" r="250" fill="#ffffff"/>')
    segs.append(f'<circle cx="{cx}" cy="{cy}" r="205" fill="{ACCENT}"/>')
    return circle_bg("".join(segs))



def icon_c3() -> str:
    """C3 = C2 的配比修正：白环加宽、中心点收小、分段缝隙更细（更接近 Chrome 的呼吸感）"""
    import math
    cx = cy = 512
    R, gap_deg = 506, 1.2
    blocks = [("夜", 60), ("休", 30), ("夜", 60), ("休", 30), ("白", 60), ("休", 30), ("白", 60), ("休", 30)]
    segs = ['<circle cx="512" cy="512" r="512" fill="#ffffff"/>']
    cursor = -90.0
    for kind, span in blocks:
        start, end = cursor + gap_deg / 2, cursor + span - gap_deg / 2
        def pt(deg):
            rad = math.radians(deg)
            return cx + R * math.cos(rad), cy + R * math.sin(rad)
        x1, y1 = pt(start)
        x2, y2 = pt(end)
        large = 1 if (end - start) > 180 else 0
        segs.append(f'<path d="M {cx} {cy} L {x1:.1f} {y1:.1f} A {R} {R} 0 {large} 1 {x2:.1f} {y2:.1f} Z" '
                    f'fill="{COLOR[kind]}"/>')
        cursor += span
    segs.append(f'<circle cx="{cx}" cy="{cy}" r="238" fill="#ffffff"/>')
    segs.append(f'<circle cx="{cx}" cy="{cy}" r="176" fill="{ACCENT}"/>')
    return circle_bg("".join(segs))



ICONS = {"a-calendar": icon_a(), "b-cycle": icon_b(), "b2-donut": icon_b2(), "b3-donut": icon_b3(), "c1-circle-ring": icon_c1(), "c2-circle-pie": icon_c2(), "c3-circle-chrome": icon_c3(), "c-glyph": icon_c()}

for name, svg in ICONS.items():
    with open(os.path.join(OUT, f"{name}.svg"), "w", encoding="utf-8", newline="\n") as f:
        f.write(svg.strip() + "\n")
    with open(os.path.join(OUT, f"{name}.html"), "w", encoding="utf-8") as f:
        f.write("<!doctype html><meta charset='utf-8'>"
                "<style>html,body{margin:0;padding:0;background:transparent}"
                "svg{display:block}</style>" + svg)

rows = []
for name, svg in ICONS.items():
    inner = svg.replace('width="1024" height="1024"', 'width="100%" height="100%"', 1)
    cells = "".join(
        f'<div class="cell {size}">{inner}</div>' for size in ("big", "mid", "sm", "xs", "xxs")
    )
    rows.append(f"""
    <section class="row">
      <span class="name">{name}</span>
      <div class="strip light">{cells}</div>
      <div class="strip dark">{cells}</div>
    </section>""")

sheet = f"""<!doctype html><meta charset='utf-8'>
<style>
  html,body{{margin:0;background:#fff;font:13px/1.4 "Segoe UI","Microsoft YaHei",sans-serif;color:#333}}
  .wrap{{padding:24px 28px}}
  h1{{margin:0 0 4px;font-size:15px;font-weight:600}}
  p.sub{{margin:0 0 18px;color:#8a9299;font-size:12px}}
  .row{{display:flex;align-items:center;gap:18px;margin-bottom:16px}}
  .name{{width:96px;color:#666;font-size:12px}}
  .strip{{display:flex;align-items:flex-end;gap:14px;padding:12px 14px;border-radius:10px}}
  .strip.light{{background:#f6f7f8}}
  .strip.dark{{background:#1a1c1e}}
  .cell{{flex:0 0 auto}}
  .cell svg{{display:block}}
  .big svg{{width:120px;height:120px}}
  .mid svg{{width:64px;height:64px}}
  .sm  svg{{width:32px;height:32px}}
  .xs  svg{{width:24px;height:24px}}
  .xxs svg{{width:16px;height:16px}}
</style>
<div class="wrap">
  <h1>图标候选：120 / 64 / 32 / 24 / 16 px</h1>
  <p class="sub">左列浅色底（#f6f7f8）、右列深色底（#1a1c1e）—— 检查小尺寸与双主题下的辨识度</p>
  {''.join(rows)}
</div>"""

with open(os.path.join(OUT, "sheet.html"), "w", encoding="utf-8") as f:
    f.write(sheet)

print("written:", ", ".join(sorted(os.listdir(OUT))))
