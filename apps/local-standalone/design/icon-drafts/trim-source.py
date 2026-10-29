"""把外部给的蓝色日历图标裁成透明底的 1024 图标。

源图是 JPEG（1254×1254，四周白底，蓝色圆角方块约占 1150px）。做法不是抠色，
而是**几何遮罩**：方块本身就是一个圆角矩形，量出包围盒与圆角半径后直接用它当 alpha，
比按颜色抠图干净得多 —— 抠色会在蓝白交界处留下一圈灰边。

实测：包围盒 (50,55)-(1199,1198)，圆角半径 ≈ 288px（对 1150px 边长 ≈ 25%）。
遮罩整体内缩 2px（1024 尺度）以吃掉 JPEG 压缩在边缘留下的一圈淡白。
"""

from PIL import Image, ImageDraw

SRC = r'C:/Users/10369/.workbuddy/clipboard-images/clipboard-2026-10-29T03-15-35-885Z-a54f6bfc.jpg'
OUT = r'D:/Dev/shift-schedule-miniapp/apps/local-standalone/design/icon-drafts/d-blue-calendar.png'

SIZE = 1024
SS = 4                # 遮罩超采样倍数
BOX = (50, 51, 1200, 1201)   # 裁成正方形：以方块中心为准
RADIUS_SRC = 288
INSET = 7             # 1024 尺度上的内缩：源图蓝白交界有 3–5px 的压缩淡边，不躲开会在深色底上留一圈白

im = Image.open(SRC).convert('RGB').crop(BOX).resize((SIZE, SIZE), Image.LANCZOS)

radius = round(RADIUS_SRC / (BOX[2] - BOX[0]) * SIZE)   # 256
mask = Image.new('L', (SIZE * SS, SIZE * SS), 0)
draw = ImageDraw.Draw(mask)
draw.rounded_rectangle(
    [(INSET * SS, INSET * SS), (SIZE * SS - INSET * SS, SIZE * SS - INSET * SS)],
    radius=(radius - INSET) * SS,
    fill=255
)
mask = mask.resize((SIZE, SIZE), Image.LANCZOS)

im.putalpha(mask)
im.save(OUT)
print('radius', radius, '->', OUT)
