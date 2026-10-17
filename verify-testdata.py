import sys, time
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:6180/index.html"
PATH = r"D:\Dev\shift-schedule-miniapp\apps\local-standalone\倒班表-测试数据-10月加班.json"

EXPECT = {
    "华文达": {"平日": 20, "特勤": 16, "法定": 20, "总计": 56, "事假": 28},
    "张舒棋": {"平日": 5, "特勤": 5, "法定": 3, "总计": 13, "事假": 4},
    "陈泳智": {"平日": 5.5, "特勤": 3, "法定": 6, "总计": 14.5, "事假": 0},
}

fails = []


def click_btn(pg, label):
    for b in pg.query_selector_all("button"):
        if b.inner_text().strip() == label:
            b.click()
            return True
    return False


def cur_person(pg):
    el = pg.query_selector(".person-chip")
    return el.inner_text().replace("▾", "").strip() if el else None


def set_month(pg, want="10月"):
    """统计页 .filter-chip 是月份选择器，弹 .sheet 里 .picker-item。"""
    pg.click(".filter-chip")
    time.sleep(0.3)
    pg.click(".picker-item:text-is('%s')" % want)
    time.sleep(0.4)


def switch_person(pg, name):
    pg.click(".person-chip")
    time.sleep(0.3)
    for sel in [".picker-item", ".sheet li", "li", "button"]:
        for opt in pg.query_selector_all(sel):
            if name in opt.inner_text() and "▾" not in opt.inner_text():
                opt.click()
                time.sleep(0.4)
                return name in (cur_person(pg) or "")
    pg.keyboard.press("Escape")
    return False


def panel_text(pg, keyword):
    for p in pg.query_selector_all(".panel"):
        t = p.inner_text()
        if keyword in t:
            return t
    return "(未找到面板 %s)" % keyword


def main():
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        pg = b.new_page(viewport={"width": 1479, "height": 876})
        pg.on("dialog", lambda d: d.accept())
        pg.goto(URL, wait_until="networkidle")

        pg.evaluate("() => localStorage.clear()")
        pg.reload(wait_until="networkidle")

        pg.set_input_files("input[aria-label='导入排班备份文件']", PATH)
        time.sleep(1.0)
        print("导入后人员:", cur_person(pg))

        for who, exp in EXPECT.items():
            print("\n" + "=" * 62)
            ok = switch_person(pg, who)
            print("切人 -> %s : %s (当前 %r)" % (who, ok, cur_person(pg)))
            if not ok:
                fails.append("%s 切人失败" % who)
                continue

            click_btn(pg, "统计")
            time.sleep(0.6)
            set_month(pg, "10月")

            click_btn(pg, "月度概览")
            time.sleep(0.4)
            ov = panel_text(pg, "月度概览")
            click_btn(pg, "每日明细")
            time.sleep(0.4)
            dt = panel_text(pg, "每日明细")

            print("--- 月度概览 ---")
            print(ov[:1200])
            print("--- 每日明细（汇总段）---")
            print(dt[dt.find("按班次汇总"):][:600])

            got = {}
            for k in ("平日", "特勤", "法定", "总计"):
                if k == "总计":
                    seg = ov[ov.find("加班分布"):]
                    import re
                    m = re.search(r"(\d+(?:\.\d+)?)h", seg)
                    got[k] = float(m.group(1)) if m else None
            ov_hours = {}
            rows = ov.splitlines()
            for i, ln in enumerate(rows):
                if ln in ("平日 ×1.5", "特勤 ×2", "法定 ×3") and i + 1 < len(rows):
                    v = rows[i + 1].replace("¥", "").strip()
                    ov_hours[ln.split()[0]] = v
            print("\n概览三档:", ov_hours)

            # 每日明细底部合计
            tail = dt[dt.find("加班合计"):]
            print("明细合计:", " ".join(tail.split()[:12]))

            exp_str = "预期: %s" % exp
            print(exp_str)
            for k, v in exp.items():
                if k in ov_hours:
                    got[k] = float(ov_hours[k].replace("h", ""))
                if k == "总计":
                    m = [t for t in tail.split() if t.endswith("h")][0]
                    got[k] = float(m[:-1])
            print("核对:", got)
            for k, v in exp.items():
                if got.get(k) is not None and abs(got[k] - v) > 0.01:
                    fails.append("%s %s 预期%g 实得%g" % (who, k, v, got[k]))

            click_btn(pg, "← 返回")
            time.sleep(0.5)

        print("\n" + "=" * 62)
        print("FAIL:", fails if fails else "无，全部符合预期")
        b.close()


main()