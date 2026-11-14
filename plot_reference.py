"""Redraw the project guide's monthly comparison in the selected language (Matplotlib)."""

import argparse
import csv

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib import font_manager
from matplotlib.ft2font import FT2Font
from matplotlib.ticker import MultipleLocator

from weather import ROOT


TEXT = {
    "en": {
        "title": "Astana data-centre cooling",
        "subtitle": "{supply} °C supply  ·  Astana EPW station ID 351880  ·  2011–2025 typical year",
        "electricity_title": "Monthly cooling-plant electricity",
        "electricity_unit": "MWh electricity",
        "systems": ("Chiller only", "Dry cooler + chiller"),
        "modes_title": "Operating mode of the dry-cooler system",
        "hours_unit": "Operating hours",
        "modes": ("Chiller off", "Assisted", "Chiller only"),
        "months": "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec",
        "credit": "Weather: L. K. Lawrie and D. B. Crawley, Climate.OneBuilding. Plant assumptions: KazDC-BIM reference case.",
    },
    "zh": {
        "title": "阿斯塔纳数据中心制冷",
        "subtitle": "供液温度 {supply} °C  ·  阿斯塔纳 EPW 站点 351880  ·  基于 2011–2025 年资料的典型年",
        "electricity_title": "制冷系统月用电量",
        "electricity_unit": "用电量（MWh）",
        "systems": ("仅冷水机组", "干式冷却器与冷水机组"),
        "modes_title": "配备干式冷却器的系统运行模式",
        "hours_unit": "运行时间（小时）",
        "modes": ("冷水机组停机", "联合运行", "仅冷水机组"),
        "months": "1月 2月 3月 4月 5月 6月 7月 8月 9月 10月 11月 12月",
        "credit": "气象数据由 L. K. Lawrie 和 D. B. Crawley 编制，来源为 Climate.OneBuilding。设备参数取自 KazDC-BIM 参考算例。",
    },
    "ru": {
        "title": "Охлаждение дата-центра в Астане",
        "subtitle": "Подача {supply} °C  ·  Станция EPW 351880  ·  Типичный год по данным 2011–2025 гг.",
        "electricity_title": "Электроэнергия на охлаждение по месяцам",
        "electricity_unit": "Электроэнергия, МВт·ч",
        "systems": ("Только чиллер", "Сухой охладитель и чиллер"),
        "modes_title": "Режимы системы с сухим охладителем",
        "hours_unit": "Часы работы",
        "modes": ("Чиллер выключен", "Совместная работа", "Только чиллер"),
        "months": "янв фев мар апр май июн июл авг сен окт ноя дек",
        "credit": "Метеоданные L. K. Lawrie и D. B. Crawley, Climate.OneBuilding. Параметры оборудования — из эталонного расчёта KazDC-BIM.",
    },
    "kk": {
        "title": "Астанадағы деректер орталығын салқындату",
        "subtitle": "Беру температурасы {supply} °C  ·  EPW станциясы 351880  ·  2011–2025 жылдар негізіндегі типтік жыл",
        "electricity_title": "Салқындатуға жұмсалатын айлық электр энергиясы",
        "electricity_unit": "Электр энергиясы, МВт·сағ",
        "systems": ("Тек чиллер", "Құрғақ салқындатқыш пен чиллер"),
        "modes_title": "Құрғақ салқындатқышы бар жүйенің жұмыс режимдері",
        "hours_unit": "Жұмыс уақыты, сағ",
        "modes": ("Чиллер өшірулі", "Бірлескен жұмыс", "Тек чиллер"),
        "months": "қаң ақп нау сәу мам мау шіл там қыр қаз қар жел",
        "credit": "Метеодеректерді құрастырған L. K. Lawrie және D. B. Crawley, Climate.OneBuilding. Жабдық параметрлері KazDC-BIM эталондық есебінен алынған.",
    },
}


def chinese_font():
    """Choose an installed face that covers the Chinese labels, without downloading a font."""
    characters = {ord(char) for value in TEXT["zh"].values() for char in str(value)
                  if "\u3400" <= char <= "\u9fff"}
    families = ("Noto Sans CJK SC", "Microsoft YaHei", "PingFang SC", "Source Han Sans SC",
                "WenQuanYi Zen Hei", "SimHei", "Noto Sans CJK JP")
    for family in families:
        for font in font_manager.fontManager.ttflist:
            if font.name == family and characters.issubset(FT2Font(font.fname).get_charmap()):
                return family
    raise SystemExit("The zh figure needs an installed Chinese font, e.g. Noto Sans CJK.")


def plot(rows, language):
    text = TEXT[language]
    labels = text["months"].split()
    x = list(range(len(labels)))
    base = [float(row["baseline_mwh_e"]) for row in rows]
    hybrid = [float(row["hybrid_mwh_e"]) for row in rows]
    colours = ["#00786f", "#ba792a", "#445666"]
    family = chinese_font() if language == "zh" else "DejaVu Sans"
    plt.rcParams.update({"font.family": family, "font.size": 10, "axes.spines.top": False,
                         "axes.spines.right": False, "axes.spines.left": False,
                         "axes.edgecolor": "#a7b6b0", "text.color": "#183c3b",
                         "axes.labelcolor": "#36534e", "xtick.color": "#36534e", "ytick.color": "#36534e"})
    fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(10.6, 7.3), sharex=True)
    fig.subplots_adjust(left=.105, right=.975, top=.80, bottom=.12, hspace=.70)
    fig.text(.105, .95, text["title"], fontsize=22, fontweight="bold")
    supply = float(rows[0]["supply_c"])
    fig.text(.105, .905, text["subtitle"].format(supply=f"{supply:g}"), fontsize=10.5, color="#48605b")
    ax1.bar([i - .19 for i in x], base, width=.34, color="#7b8c98", label=text["systems"][0])
    ax1.bar([i + .19 for i in x], hybrid, width=.34, color=colours[0], label=text["systems"][1])
    ax1.set_ylabel(text["electricity_unit"])
    ax1.set_title(text["electricity_title"], loc="left", fontsize=12, fontweight="bold", pad=25)
    ax1.yaxis.set_major_locator(MultipleLocator(50))
    running = [0] * len(rows)
    for key, colour, label in zip(("off_hours", "assist_hours", "mechanical_hours"), colours, text["modes"]):
        hours = [int(row[key]) for row in rows]
        ax2.bar(x, hours, width=.66, bottom=running, color=colour, label=label)
        running = [a + b for a, b in zip(running, hours)]
    ax2.set_ylabel(text["hours_unit"])
    ax2.set_ylim(0, 800)
    ax2.set_title(text["modes_title"], loc="left", fontsize=12, fontweight="bold", pad=25)
    ax2.yaxis.set_major_locator(MultipleLocator(200))
    ax2.set_xticks(x, labels)
    for axis in (ax1, ax2):
        axis.legend(loc="lower left", bbox_to_anchor=(0, 1.005), ncol=3, borderaxespad=0,
                    frameon=False, handlelength=1.0, handletextpad=.4, columnspacing=1.4, fontsize=9)
        axis.grid(axis="y", color="#dce4de", linewidth=.7)
        axis.set_axisbelow(True)
        axis.tick_params(length=0)
        axis.set_xlim(-.6, len(labels)-.4)
    fig.text(.105, .045, text["credit"], fontsize=8, color="#48605b")
    suffix = "" if language == "en" else "_" + language
    fig.savefig(ROOT / f"reference/monthly_cooling{suffix}.png", dpi=180, facecolor="white")
    plt.close(fig)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--language", choices=(*TEXT, "all"), default="en",
                        help="figure language (default: English)")
    args = parser.parse_args()
    with (ROOT / "reference/monthly.csv").open(encoding="utf-8") as source:
        rows = list(csv.DictReader(source))
    if [row["month"] for row in rows] != TEXT["en"]["months"].split():
        raise ValueError("reference/monthly.csv must contain January through December, in order")
    languages = TEXT if args.language == "all" else (args.language,)
    for language in languages:
        plot(rows, language)


if __name__ == "__main__":
    main()
