"""Assemble offline platform pages from the pinned weather series and shared plant model."""
from html import escape, unescape
import hashlib
import json
import re
from dataclasses import asdict
from collections import Counter
from functools import lru_cache
from itertools import product
from string import Template
from urllib.parse import quote

from cooling import MONTHS, dispatch
from methods import number as format_model_number
from weather import ROOT, read_weather


def platform_data(plant, supplies):
    stations = json.loads((ROOT / "data/regions/stations.json").read_text(encoding="utf-8"))
    all_temperatures = set()
    distributions = []
    for station in stations:
        source = ROOT / station["csv"]
        if hashlib.sha256(source.read_bytes()).hexdigest() != station["csv_sha256"]:
            raise ValueError(f"Weather checksum differs for {station['name']}")
        hours = read_weather(source)
        counts = [Counter() for _ in range(12)]
        for hour in hours:
            counts[hour.month - 1][hour.dry_bulb_c] += 1
        all_temperatures.update(hour.dry_bulb_c for hour in hours)
        distributions.append(counts)
    temperatures = sorted(all_temperatures)
    bins = {value: i for i, value in enumerate(temperatures)}
    for station, months in zip(stations, distributions):
        # Counts are lossless for these hourly models with no state carried between hours.
        station["months"] = [[[bins[t], n] for t, n in sorted(month.items())] for month in months]
    table = {}
    for supply in supplies:
        rows = [dispatch(t, supply, plant) for t in temperatures]
        table[f"{supply:g}"] = [[round(r.hybrid_kw_e, 9), int(r.chiller_kw_th == 0)] for r in rows]
    return {"stations": stations, "temperatures": temperatures, "cooling": table,
            "plant": asdict(plant), "it_kw": plant.it_kw, "baseline_kw": plant.it_kw / plant.chiller_cop + plant.loop_pump_kw}


CITY_NAMES_ZH = {
    "aktau": "阿克套", "aktobe": "阿克托别", "almaty": "阿拉木图", "astana": "阿斯塔纳",
    "atyrau": "阿特劳", "ekibastuz": "埃基巴斯图兹", "karaganda": "卡拉干达",
    "kokshetau": "科克舍套", "kostanay": "科斯塔奈", "kyzylorda": "克孜勒奥尔达",
    "oral": "乌拉尔斯克", "oskemen": "厄斯克门", "pavlodar": "巴甫洛达尔",
    "petropavl": "彼得罗巴甫洛夫斯克", "qonaev": "库纳耶夫", "semey": "塞梅伊",
    "shymkent": "奇姆肯特", "taldykorgan": "塔尔迪库尔干", "taraz": "塔拉兹",
    "turkistan": "突厥斯坦", "zhezkazgan": "热兹卡兹甘",
}


CITY_NAMES_RU = {
    "aktau": "Актау", "aktobe": "Актобе", "almaty": "Алматы", "astana": "Астана",
    "atyrau": "Атырау", "ekibastuz": "Экибастуз", "karaganda": "Караганда",
    "kokshetau": "Кокшетау", "kostanay": "Костанай", "kyzylorda": "Кызылорда",
    "oral": "Уральск", "oskemen": "Усть-Каменогорск", "pavlodar": "Павлодар",
    "petropavl": "Петропавловск", "qonaev": "Конаев", "semey": "Семей",
    "shymkent": "Шымкент", "taldykorgan": "Талдыкорган", "taraz": "Тараз",
    "turkistan": "Туркестан", "zhezkazgan": "Жезказган",
}

CITY_NAMES_KK = {
    "aktau": "Ақтау", "aktobe": "Ақтөбе", "almaty": "Алматы", "astana": "Астана",
    "atyrau": "Атырау", "ekibastuz": "Екібастұз", "karaganda": "Қарағанды",
    "kokshetau": "Көкшетау", "kostanay": "Қостанай", "kyzylorda": "Қызылорда",
    "oral": "Орал", "oskemen": "Өскемен", "pavlodar": "Павлодар",
    "petropavl": "Петропавл", "qonaev": "Қонаев", "semey": "Семей",
    "shymkent": "Шымкент", "taldykorgan": "Талдықорған", "taraz": "Тараз",
    "turkistan": "Түркістан", "zhezkazgan": "Жезқазған",
}

LANGUAGES = {
    "en": ("", "English", "Language"),
    "kk": ("_kk", "Қазақша", "Тіл"),
    "ru": ("_ru", "Русский", "Язык"),
    "zh-Hans": ("_zh", "简体中文", "语言"),
}

SOURCE_LINK_TEXT = {
    "en": ("Download project ZIP", "Project guide and source files"),
    "zh-Hans": ("下载项目压缩包（ZIP）", "项目说明与源文件"),
    "ru": ("Скачать проект (ZIP)", "Описание проекта и исходные файлы"),
    "kk": ("Жобаны жүктеу (ZIP)", "Жоба нұсқаулығы мен бастапқы файлдар"),
}

SHELL_TEXT = {
    "en": {
        "brand": "Energy Tech", "skip": "Skip to main content",
        "description": "Compare cooling, heat reuse and power supply for data centres in Kazakhstan with interactive KazDC-BIM models and hourly weather data.",
        "nav": "Models and experiments", "footer": "Kazakhstan data-centre energy studies",
        "resources": "Resources", "methods": "Astana methods", "languages": "Page language",
        "links": {"regional": "Regional cooling", "tech": "Technologies", "snow": "Snow storage",
                  "heat": "Heat reuse", "power": "Power delivery", "bench": "Experiment bench",
                  "references": "References"},
    },
    "zh-Hans": {
        "brand": "能源技术", "skip": "跳转至正文",
        "description": "利用 KazDC-BIM 交互式模型和逐时气象数据，比较哈萨克斯坦数据中心的制冷、余热利用和供电方案。",
        "nav": "模型与实验", "footer": "哈萨克斯坦数据中心能源研究",
        "resources": "相关资源", "methods": "阿斯塔纳计算方法", "languages": "页面语言",
        "links": {"regional": "各城市制冷", "tech": "技术模型", "snow": "储雪供冷",
                  "heat": "余热回收", "power": "供配电", "bench": "实验台", "references": "参考资料"},
    },
    "ru": {
        "brand": "Энерготехнологии",
        "description": "Сравните варианты охлаждения, использования тепла и электроснабжения дата-центров Казахстана с помощью интерактивных моделей KazDC-BIM и почасовых метеоданных.",
        "skip": "К основному содержанию", "nav": "Модели и эксперименты",
        "footer": "Энергопотребление дата-центров Казахстана", "resources": "Материалы",
        "methods": "Методика расчёта для Астаны", "languages": "Язык страницы",
        "links": {"regional": "Города", "tech": "Технологии", "snow": "Хранение снега",
                  "heat": "Утилизация тепла", "power": "Электропитание", "bench": "Эксперимент",
                  "references": "Источники"},
    },
    "kk": {
        "brand": "энергетика технологиялары",
        "description": "KazDC-BIM интерактивті модельдері мен сағаттық метеодеректер арқылы Қазақстандағы деректерді өңдеу орталықтарын салқындату, жылуды қайта пайдалану және электрмен жабдықтау тәсілдерін салыстырыңыз.",
        "skip": "Негізгі мазмұнға өту", "nav": "Модельдер мен тәжірибелер",
        "footer": "Қазақстандағы деректерді өңдеу орталықтарының энергия тұтынуы",
        "resources": "Материалдар", "methods": "Астанаға арналған есептеу әдісі", "languages": "Бет тілі",
        "links": {"regional": "Қалалар", "tech": "Технологиялар", "snow": "Қар сақтау",
                  "heat": "Жылуды пайдалану", "power": "Электрмен жабдықтау", "bench": "Тәжірибе",
                  "references": "Дереккөздер"},
    },
}

INMET_HOME = "https://inmet.nu.edu.kz/"
CONTACT_TEXT = {
    "en": {
        "nav": "Contact", "affiliation": "Project affiliation", "contact": "Project contact",
        "institute": "Institute of New Materials and Energy Technologies", "institute_url": INMET_HOME,
        "university": "Nazarbayev University", "name": "Dr. Yanwei Wang",
    },
    "zh-Hans": {
        "nav": "联系方式", "affiliation": "项目所属机构", "contact": "项目联系人",
        "institute": "新材料与能源技术研究院", "institute_url": INMET_HOME,
        "university": "纳扎尔巴耶夫大学", "name": "Yanwei Wang 博士",
    },
    "ru": {
        "nav": "Контакты", "affiliation": "Организация проекта", "contact": "Контактное лицо",
        "institute": "Институт новых материалов и энергетических технологий", "institute_url": INMET_HOME + "ru",
        "university": "Назарбаев Университет", "name": "Янвей Ванг, PhD",
    },
    "kk": {
        "nav": "Байланыс", "affiliation": "Жобаны ұсынған ұйым", "contact": "Байланыс тұлғасы",
        "institute": "Жаңа материалдар және энергетикалық технологиялар институты", "institute_url": INMET_HOME + "kz",
        "university": "Назарбаев Университеті", "name": "Янвей Ванг, PhD",
    },
}

STATION_TEXT = {
    "en": ({}, "Original weather ZIP for {}", "ERA5 reanalysis"),
    "zh-Hans": (CITY_NAMES_ZH, "下载{}的原始气象文件（ZIP）", "ERA5 再分析"),
    "ru": (CITY_NAMES_RU, "Исходный метеофайл (ZIP) — {}", "Реанализ ERA5"),
    "kk": (CITY_NAMES_KK, "{} қаласының бастапқы метеофайлы (ZIP)", "ERA5 реанализі"),
}

STUDY_TITLES = {
    "en": {"heat": "Heat recovery", "power": "UPS conversion losses", "bench": "Water-loop experiment",
           "tech": "Technology workbench", "references": "References"},
    "zh-Hans": {"heat": "余热回收", "power": "不间断电源的转换损耗", "bench": "水回路实验",
                "tech": "技术模型", "references": "参考资料"},
    "ru": {"heat": "Утилизация тепла", "power": "Потери при преобразовании в ИБП", "bench": "Опыт с водяным контуром",
           "tech": "Модели технологий", "references": "Источники"},
    "kk": {"heat": "Жылуды қайта пайдалану", "power": "Үздіксіз қуат көзіндегі түрлендіру шығындары",
           "bench": "Су контурындағы тәжірибе", "tech": "Технология модельдері", "references": "Дереккөздер"},
}

FULL_MONTHS = {
    "en": "January February March April May June July August September October November December".split(),
    "zh-Hans": "一月 二月 三月 四月 五月 六月 七月 八月 九月 十月 十一月 十二月".split(),
    "ru": "январь февраль март апрель май июнь июль август сентябрь октябрь ноябрь декабрь".split(),
    "kk": "қаңтар ақпан наурыз сәуір мамыр маусым шілде тамыз қыркүйек қазан қараша желтоқсан".split(),
}


def localized_template(filename, language):
    web = ROOT / "web"
    return (web if language == "en" else web / "i18n" / language) / filename


def inline_json(value):
    """Embed JSON as script data even if a string contains an HTML end tag."""
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), allow_nan=False).replace("<", "\\u003c")


@lru_cache(maxsize=len(LANGUAGES))
def research_text(language):
    return json.loads((ROOT / "web/research" / f"{language}.json").read_text(encoding="utf-8"))


def research_brief_file(language):
    code = language.split("-")[0].upper()
    return f"reference/KazDC_Research_Brief_{code}.pdf"


def research_body(template, language, data):
    """Use the regional dispatch table for the same July that the linked cases display."""
    copy = research_text(language)
    station = next(s for s in data["stations"] if s["slug"] == "ekibastuz")
    july = station["months"][6]
    hours = sum(count for _, count in july)
    rows = []
    for supply in (18, 24):
        off = sum(count * data["cooling"][str(supply)][index][1] for index, count in july)
        label = escape(copy["supplyLabel"].format(temperature=supply))
        metric = escape(copy["hoursLabel"]).format(off=f"<strong>{off}</strong>", hours=hours)
        link = escape(copy["openCase"].format(temperature=supply))
        case_url = "{{REGIONAL_URL}}" + f"?city=ekibastuz&amp;supply={supply}"
        rows.append(f'<div data-supply="{supply}" data-off="{off}"><dt>{label}</dt>'
                    f'<dd>{metric}<a href="{case_url}">{link}</a></dd></div>')
    questions = []
    work_label, outcome_label = escape(copy["workLabel"]), escape(copy["outcomeLabel"])
    for question in copy["questions"]:
        questions.append(f'<article class="research-question"><h3>{escape(question["question"])}</h3>'
                         f'<div><h4>{work_label}</h4><p>{escape(question["work"])}</p></div>'
                         f'<div><h4>{outcome_label}</h4><p>{escape(question["outcome"])}</p></div></article>')
    it_mw = f'{data["it_kw"] / 1000:g}'
    html = re.sub(r"\{\{Q_(\w+)\}\}", lambda m: escape(copy[m[1]].format(it=it_mw)), template)
    return (html.replace("{{JULY_HOURS}}", str(hours)).replace("{{JULY_ROWS}}", "\n".join(rows))
            .replace("{{PRIORITY_ROWS}}", "\n".join(questions)).replace("{{BRIEF_FILE}}", research_brief_file(language)))


def fill_page_urls(html, names, language):
    suffix = LANGUAGES[language][0]
    return re.sub(r"\{\{([A-Z]+)_URL\}\}", lambda match: names[match[1].lower() + suffix], html)


@lru_cache(maxsize=len(LANGUAGES))
def locale_script(language):
    web = ROOT / "web"
    results = json.loads((web / "regional" / f"{language}.json").read_text(encoding="utf-8"))["results"]
    station_keys = ("station", "airport", "internationalAirport", "era", "qonaev", "origin", "quality")
    settings = {"lang": language, "locale": "en-US" if language == "en" else language,
                "months": FULL_MONTHS[language], "shortMonths": results.get("months", MONTHS),
                "cities": STATION_TEXT[language][0], "station": {key: results[key] for key in station_keys}}
    return (web / "site-locale.js").read_text(encoding="utf-8").replace("{{LOCALE_DATA}}", inline_json(settings))


PUBLIC_SITE = "https://ktwyw.github.io/kazdc-energy-tech/"
MODEL_VERSION = "1.0.0"


def apply_site_brand(page, language, names, page_key, public_names):
    labels = SHELL_TEXT[language]
    brand = escape(labels["brand"])
    name = f"KazDC {brand}"
    page = page.replace("{{SITE_TITLE}}", name).replace("{{BRAND_LABEL}}", brand)
    # Reuse the localized page introduction for shared links and search snippets.
    introduction = re.search(r"</h1>\s*<p\b[^>]*>(.*?)</p>", page, re.DOTALL)
    summary = unescape(re.sub(r"<[^>]+>", "", introduction[1])) if introduction else labels["description"]
    description = escape(" ".join(summary.split()))
    title = escape(unescape(re.search(r"<title>(.*?)</title>", page, re.DOTALL)[1]))
    metadata = (f'<meta name="description" content="{description}">\n'
                f'<meta property="og:site_name" content="{name}">\n'
                f'<meta property="og:type" content="website">\n'
                f'<meta property="og:title" content="{title}">\n'
                f'<meta property="og:description" content="{description}">')
    alternates = []
    links = []
    for lang, (suffix, label, _) in LANGUAGES.items():
        target = names[page_key + suffix]
        alternates.append(f'<link rel="alternate" hreflang="{lang}" href="{target}">')
        if lang == language:
            links.append(f'<span lang="{lang}" aria-current="page">{label}<b aria-hidden="true">✓</b></span>')
            continue
        attributes = " data-language-section"
        if page_key == "regional":
            attributes += " data-language-case"
        elif page_key == "references":
            attributes += " data-reference-language"
        links.append(f'<a lang="{lang}" hreflang="{lang}" href="{target}"{attributes}>{label}</a>')
    globe = ('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" '
             'aria-hidden="true"><circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/>'
             '<path d="M3 12h18"/></svg>')
    menu = (f'<details class="language-menu"><summary>{globe}{LANGUAGES[language][2]}</summary>'
            f'<div class="language-options">{"".join(links)}</div></details>')
    metadata += "\n" + "\n".join(alternates) + "\n<script>" + locale_script(language) + "</script>"
    web = ROOT / "web"
    if "{{COPY_CASE" in page:
        share = json.loads((web / "i18n/case-share.json").read_text(encoding="utf-8"))[language]
        filename = public_names[page_key + LANGUAGES[language][0]]
        settings = {"publicURL": PUBLIC_SITE + ("" if filename == "index.html" else filename),
                    "version": MODEL_VERSION, "labels": share}
        metadata += ('\n<script type="application/json" id="case-share-data">' + inline_json(settings)
                     + '</script>\n<script>' + (web / "case-share.js").read_text(encoding="utf-8") + '</script>')
        def copy_control(match):
            section = f' data-case-section="{match[1]}"' if match[1] else ""
            return (f'<div class="case-share" hidden><button type="button" data-copy-case{section} disabled>'
                    f'{escape(share["copy"])}</button><output role="status"></output><textarea readonly hidden></textarea></div>')
        page = re.sub(r"\{\{COPY_CASE(?:@([a-z-]+))?\}\}", copy_control, page)
    contact = {field: escape(value) for field, value in CONTACT_TEXT[language].items()}
    research = research_text(language)
    contact["invitation"] = escape(research["invitation"])
    contact["reference_mail"] = "mailto:yanwei.wang@nu.edu.kz?subject=" + quote(research["subject"], safe="")
    credit = Template((web / "project-credit.html").read_text(encoding="utf-8")).substitute(contact)
    return (page.replace("{{SITE_METADATA}}", metadata).replace("{{LANGUAGE_MENU}}", menu)
            .replace("{{RESEARCH_NAV_LABEL}}", escape(research["nav"]))
            .replace("{{CONTACT_LABEL}}", contact["nav"]).replace("{{PROJECT_CREDIT}}", credit)
            .replace("{{CREDIT_STYLE}}", (web / "project-credit.css").read_text(encoding="utf-8"))
            .replace("{{LANGUAGE_STYLE}}", (web / "language-menu.css").read_text(encoding="utf-8"))
            .replace("{{LANGUAGE_SCRIPT}}", (web / "language-menu.js").read_text(encoding="utf-8")))


def station_rows(stations, language):
    city_names, archive_format, reanalysis = STATION_TEXT[language]
    rows = []
    for city in sorted(stations, key=lambda s: s["name"]):
        name = escape(city["name"])
        local_name = escape(city_names[city["slug"]]) if city_names else name
        archive_label = archive_format.format(local_name)
        if city_names:
            name = f'{local_name}<small lang="en" class="station-alias">{name}</small>'
        origin = reanalysis if "ERA5" in city["epw_source"] else "NCEI ISD / ERA5"
        rows.append(
            f'<tr><th scope="row">{name}</th><td>{escape(city["epw_location"])}</td>'
            f'<td>{escape(city["station_id"])}</td><td>{origin}</td>'
            f'<td>{city["source_years"]} ({escape(city["period"])})</td><td>UTC+{city["utc_offset"]:g}</td>'
            f'<td><a href="{escape(city["source_url"], quote=True)}" '
            f'aria-label="{archive_label}">ZIP</a></td></tr>'
        )
    return "\n".join(rows)


def reference_weather(data, language, text):
    names = STATION_TEXT[language][0]
    cities = []
    for station in data["stations"]:
        means = [sum(data["temperatures"][i] * n for i, n in month) / sum(n for _, n in month)
                 for month in station["months"]]
        cities.append({"slug": station["slug"], "name": names.get(station["slug"], station["name"]),
                       "means": [round(t, 6) for t in means]})
    return {"cities": cities, "months": text.get("months", MONTHS), "chart": text["chart"]}


def default_result_labels(default, language, text, it_kw):
    """Put the same reference result in the initial HTML and the interactive display."""
    def number(value, digits=0):
        result = f"{value:,.{digits}f}"
        if language in ("ru", "kk"):
            result = result.replace(",", "\u00a0").replace(".", ",")
        return result

    annual, july = default["annual"], default["months"][6]
    return {
        "{{CASE_JULY}}": escape(text["caseJuly"].format(off=number(july["off_hours"]), hours=number(july["hours"]))),
        "{{CASE_SAVING}}": number(annual["savings_pct"], 1) + "%",
        "{{CASE_BASELINE}}": number(annual["baseline_mwh_e"], 1),
        "{{CASE_HYBRID}}": number(annual["hybrid_mwh_e"], 1),
        "{{CASE_RATIO}}": str(100 * annual["hybrid_mwh_e"] / annual["baseline_mwh_e"]),
        "{{CASE_CONTEXT}}": escape(text["caseContext"].format(
            city=STATION_TEXT[language][0].get("astana", "Astana"), it=f"{it_kw / 1000:g}",
            supply=f'{annual["supply_c"]:g}')),
        "{{CASE_OFF}}": escape(text["caseOff"].format(off=number(annual["off_hours"]), hours=number(annual["hours"]))),
    }


def build_lab_pages(directory, names, data, tech_data, default, snow_reference, sensitivity, public_names, portable=False):
    web = ROOT / "web"
    css = (web / "lab.css").read_text(encoding="utf-8")
    model = (web / "lab-model.js").read_text(encoding="utf-8")
    shared = (web / "lab-shell.html").read_text(encoding="utf-8")
    common = (web / "lab-common.js").read_text(encoding="utf-8")
    chart = (web / "monthly-chart.js").read_text(encoding="utf-8")
    ui = (web / "lab-ui.js").read_text(encoding="utf-8")
    for language, key in product(LANGUAGES, ("regional", "references", "heat", "power", "bench", "tech", "research")):
        suffix = LANGUAGES[language][0]
        translation = json.loads((web / "regional" / f"{language}.json").read_text(encoding="utf-8"))
        research = research_text(language)
        if key == "research":
            title = research["title"]
        elif key == "regional":
            title = translation["page"]["title"]
        else:
            title = STUDY_TITLES[language][key]
        if key == "regional":
            payload = data
        elif key == "heat":
            payload = {k: data[k] for k in ("stations", "temperatures", "it_kw")}
        elif key == "tech":
            payload = tech_data
        else:
            payload = {"it_kw": data["it_kw"]}
        labels = SHELL_TEXT[language]
        nav = []
        for target, label in {**labels["links"], "research": research["nav"]}.items():
            current = ' aria-current="page"' if target == key else ""
            destination = names[target + suffix]
            if target == key == "regional":
                destination += "#compare"
            nav.append(f'<a href="{destination}" data-study-link="{target}"{current}>{label}</a>')
        study_model, study_ui, style = model, ui, css
        if key in ("heat", "regional"):
            study_ui = chart + "\n" + study_ui
        if key == "tech":
            study_model = "\n".join((web / file).read_text(encoding="utf-8") for file in ("technology-model.js", "technology-studies.js"))
            study_ui = (web / "technology-ui.js").read_text(encoding="utf-8")
            style += "\n" + (web / "technology.css").read_text(encoding="utf-8")
        if key == "references":
            template = web / ("references" + suffix.replace("_", "-") + ".html")
        elif key in ("regional", "research"):
            template = web / f"{key}.html"
        else:
            template = localized_template("technologies.html" if key == "tech" else key + ".html", language)
        body = template.read_text(encoding="utf-8")
        scripts = '<script type="application/json" id="lab-data">{{DATA}}</script>\n<script>{{MODEL}}</script>\n<script>{{UI}}</script>'
        fallback = f'<noscript><p class="notice">{escape(translation["page"]["enable"])}</p></noscript>'
        if key == "research":
            body = research_body(body, language, data)
            style += "\n" + (web / "research.css").read_text(encoding="utf-8")
            scripts = fallback = ""
        if key in ("heat", "power", "bench"):
            energy = json.loads((web / "i18n" / language / "energy.json").read_text(encoding="utf-8"))
            scripts = f'<script type="application/json" id="energy-text">{inline_json(energy)}</script>\n' + scripts
        if key == "tech":
            technology = json.loads((web / "i18n" / language / "technology.json").read_text(encoding="utf-8"))
            body = body.replace("{{TECHNOLOGY_TEXT}}", inline_json(technology))
        if key == "references":
            body = body.replace("{{STATION_ROWS}}", station_rows(data["stations"], language))
            body = body.replace("{{WEATHER_FIGURE}}", (web / "weather-comparison.html").read_text(encoding="utf-8"))
            style += "\n" + (web / "references.css").read_text(encoding="utf-8")
            weather = reference_weather(data, language, translation["results"])
            scripts = ('<script type="application/json" id="weather-data">' + json.dumps(weather, ensure_ascii=False) +
                       '</script>\n<script>' + chart + '\n' + (web / "weather-comparison.js").read_text(encoding="utf-8") + '</script>')
            fallback = ""
        if key in ("regional", "references"):
            body = re.sub(r"\{\{R_(\w+)\}\}", lambda match: escape(translation["page"][match[1]]), body)
        if key == "regional":
            default_station = next(city for city in data["stations"] if city["slug"] == "astana")
            body = body.replace("{{RESEARCH_LINK}}", escape(research["homeLink"]))
            body = body.replace("{{DEFAULT_WEATHER_ARCHIVE}}", escape(default_station["source_url"], quote=True))
            example = translation["page"]["sensitivityCase"].format(
                low=format_model_number(sensitivity[3.0]["hybrid_mwh_e"], language=language, fixed=True),
                high=format_model_number(sensitivity[7.0]["hybrid_mwh_e"], language=language, fixed=True))
            body = body.replace("{{SENSITIVITY_CASE}}", escape(example))
            for tag, value in default_result_labels(default, language, translation["results"], data["it_kw"]).items():
                body = body.replace(tag, value)
            style += "\n" + (web / "regional-results.css").read_text(encoding="utf-8")
            study_model += "\n" + (web / "snow-model.js").read_text(encoding="utf-8")
            results = {**translation["results"],
                       "pairLabels": {k: translation["page"][k] for k in ("firstCity", "secondCity", "pairPower",
                                      "pairOff", "pairEnergyUnit", "pairHoursUnit", "pairMonth", "pairAnnual", "pairSupply",
                                      "try24", "back18")}}
            scripts = ('<script type="application/json" id="regional-text">' +
                       json.dumps(results, ensure_ascii=False) + '</script>\n' +
                       '<script type="application/json" id="snow-reference">' +
                       json.dumps(snow_reference, separators=(",", ":"), allow_nan=False) + '</script>\n' + scripts)
        source_label = SOURCE_LINK_TEXT[language][0]
        source_link = "" if portable else f'<a href="source.zip" data-source-download download>{source_label}</a>'
        plant = data["plant"]
        replacements = {
            "{{BODY}}": body, "{{LANG}}": language,
            "{{SKIP_LABEL}}": labels["skip"], "{{NAV_LABEL}}": labels["nav"],
            "{{FOOT_DESCRIPTION}}": labels["footer"], "{{RESOURCES_LABEL}}": labels["resources"],
            "{{METHODS_LABEL}}": labels["methods"], "{{LOCAL_REFERENCES_URL}}": names["references" + suffix],
            "{{REFS_LABEL}}": labels["links"]["references"], "{{BENCH_LABEL}}": labels["links"]["bench"],
            "{{STYLE}}": style, "{{SCRIPTS}}": scripts, "{{FALLBACK}}": fallback,
            "{{MODEL}}": study_model, "{{UI}}": common + "\n" + study_ui,
            "{{SOURCE_LINK}}": source_link, "{{TITLE}}": title, "{{PAGE}}": key,
            "{{CITY_COUNT}}": str(len(data["stations"])), "{{NAV}}": "".join(nav),
            "{{IT_MW}}": f'{plant["it_kw"] / 1000:g}', "{{IT_KW}}": f'{plant["it_kw"]:g}',
            "{{COP}}": f'{plant["chiller_cop"]:g}', "{{APPROACH}}": f'{plant["rated_approach_k"]:g}',
            "{{LOOP_RISE}}": f'{plant["loop_rise_k"]:g}', "{{FAN}}": f'{plant["dry_fan_kw"]:g}',
            "{{PUMP}}": f'{plant["loop_pump_kw"]:g}',
            "{{DATA}}": json.dumps(payload, ensure_ascii=False, separators=(",", ":"), allow_nan=False),
        }
        html = shared
        for tag, value in replacements.items():
            html = html.replace(tag, value)
        html = apply_site_brand(html, language, names, key, public_names)
        (directory / names[key + suffix]).write_text(fill_page_urls(html, names, language), encoding="utf-8")
