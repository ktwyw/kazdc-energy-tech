"""Rebuild KazDC Energy Tech, its reference studies and the static distribution."""

import argparse
import json
import subprocess
import sys
from dataclasses import asdict
from shutil import copyfile
from zipfile import ZIP_DEFLATED, ZipFile
from pathlib import Path

from cooling import DEFAULT_SUPPLY_C, Plant, calculate, write_csv
from platform_build import (LANGUAGES, SOURCE_LINK_TEXT, apply_site_brand, build_lab_pages,
                            fill_page_urls, inline_json, localized_template, platform_data, research_brief_file)
from methods import equipment_sensitivity, make_methods_page
from snow_inputs import page_data
from technology_weather import technology_weather
from weather import ROOT, read_weather


def page_names(stems, portable=False):
    result = {}
    for key, stem in stems.items():
        for suffix, _, _ in LANGUAGES.values():
            base = "regional" if key == "regional" and suffix and not portable else stem
            ending = suffix if portable else suffix.replace("_", "-")
            result[key + suffix] = base + ending + ".html"
    return result


PAGES = page_names({"regional": "index", "dashboard": "astana", "methods": "methods", "snow": "snow",
                    "heat": "heat", "power": "power", "bench": "bench", "tech": "technologies",
                    "references": "references", "research": "research-priorities"})
PORTABLE = page_names({"regional": "KazDC_Energy_Tech", "dashboard": "Astana_Cooling_Dashboard",
            "methods": "Astana_Cooling_Methods", "snow": "Astana_Snow_Cooling", "heat": "KazDC_Heat_Recovery",
            "power": "KazDC_UPS", "bench": "KazDC_Experiment", "tech": "KazDC_Technology_Workbench",
            "references": "KazDC_References", "research": "KazDC_Research_Priorities"}, portable=True)
GUIDES = {lang: "README" + suffix.replace("_", ".") + ".md" for lang, (suffix, _, _) in LANGUAGES.items()}


REFERENCE_FILES = ("case.json", "data/regions/stations.json", "data/astana_hourly.csv",
                   "data/snowcool_replay.csv", "reference/hourly.csv", "reference/monthly.csv", "reference/annual.csv",
                   *(research_brief_file(language) for language in LANGUAGES))


def copy_reference_files(directory):
    for name in REFERENCE_FILES:
        target = directory / name
        target.parent.mkdir(parents=True, exist_ok=True)
        copyfile(ROOT / name, target)


def package_site():
    """Make a static site and a clean project ZIP that works without a server."""
    published = ROOT / "dist"
    published.mkdir(exist_ok=True)
    allowed_dirs = ("data", "web", "reference", "tests")
    members = set(ROOT.glob("*.py")) | {ROOT / n for n in PAGES.values()}
    members.update(ROOT / n for n in (".gitattributes", ".gitignore", ".nojekyll", *GUIDES.values(), "case.json"))
    for name in allowed_dirs:
        members.update(p for p in (ROOT / name).rglob("*")
                       if p.is_file() and "__pycache__" not in p.parts and not p.name.startswith("."))
    with ZipFile(ROOT / "source.zip", "w", ZIP_DEFLATED, compresslevel=9) as archive:
        for file in sorted(members):
            member = "kazdc-energy-tech/" + file.relative_to(ROOT).as_posix()
            if file.parent == ROOT and file.suffix == ".html":
                # The reader has already extracted the archive. Link to its local documentation.
                html = file.read_text(encoding="utf-8")
                for language, (label, guide) in SOURCE_LINK_TEXT.items():
                    html = html.replace(f'<a href="source.zip" data-source-download download>{label}</a>',
                                        f'<a href="{GUIDES[language]}">{guide}</a>')
                archive.writestr(member, html)
            else:
                archive.write(file, member)
    copy_reference_files(published)
    for name in (*PAGES.values(), ".nojekyll", "source.zip"):
        copyfile(ROOT / name, published / name)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--downloads", type=Path, help="also write the named portable HTML files")
    parser.add_argument("--refresh-briefs", action="store_true",
                        help="regenerate the four meeting PDFs from the built pages (requires the optional PDF tools)")
    args = parser.parse_args()
    hours = read_weather()
    plant = Plant.from_file()
    reference = ROOT / "reference"
    reference.mkdir(exist_ok=True)
    scenarios = []
    annual_sweep = []
    for half_degree in range(16, 65):
        supply = half_degree / 2
        is_reference = supply == DEFAULT_SUPPLY_C
        months, annual, detail = calculate(hours, supply, plant, hourly=is_reference)
        scenarios.append({"supply_c": supply, "annual": annual, "months": months})
        annual_sweep.append(annual)
        if is_reference:
            write_csv(reference / "hourly.csv", detail)
            write_csv(reference / "monthly.csv", months)
            write_csv(reference / "annual.csv", [annual])
    write_csv(reference / "supply_sweep.csv", annual_sweep)
    payload = {"plant": asdict(plant), "default_supply_c": DEFAULT_SUPPLY_C, "scenarios": scenarios}
    web = ROOT / "web"
    style = (web / "dashboard.css").read_text(encoding="utf-8")
    guide_style = style + "\n" + (web / "methods.css").read_text(encoding="utf-8")
    guide_script = (web / "methods.js").read_text(encoding="utf-8")
    dashboard_script = (web / "dashboard.js").read_text(encoding="utf-8")
    dashboard_text = json.loads((web / "i18n/dashboard-strings.json").read_text(encoding="utf-8"))
    dashboard_data = inline_json(payload)
    default = next(s for s in scenarios if s["supply_c"] == DEFAULT_SUPPLY_C)
    sensitivity = equipment_sensitivity(hours, plant, default["annual"])
    supplies = [s["supply_c"] for s in scenarios]
    snow_data = page_data(hours, plant, supplies)
    snow_styles = style + "\n" + (web / "snow.css").read_text(encoding="utf-8")
    snow_script = (web / "snow-ui.js").read_text(encoding="utf-8")
    snow_model = (web / "snow-model.js").read_text(encoding="utf-8")
    snow_payload = inline_json(snow_data)
    regional_data = platform_data(plant, supplies)
    # The front page links to one snow scenario. Only its Astana dispatch table is needed.
    snow_reference = {k: snow_data[k] for k in ("default_supply", "indices", "temperatures", "years", "cop", "baseline_kw")}
    snow_reference["supply_tables"] = {f"{DEFAULT_SUPPLY_C:g}": snow_data["supply_tables"][f"{DEFAULT_SUPPLY_C:g}"]}
    tech_data = {"plant": asdict(plant), "weather": technology_weather(regional_data["stations"]),
                 "stations": [{k: v for k, v in s.items() if k in ("slug", "name", "location_note", "station_id",
                               "epw_source", "period", "source_years", "source_url", "utc_offset", "quality_note")} for s in regional_data["stations"]]}
    destinations = [(ROOT, PAGES)]
    if args.downloads:
        args.downloads.mkdir(parents=True, exist_ok=True)
        destinations.append((args.downloads, PORTABLE))
    for language, (suffix, _, _) in LANGUAGES.items():
        dashboard = localized_template("layout.html", language).read_text(encoding="utf-8")
        dashboard = (dashboard.replace("{{STYLE}}", style).replace("{{DATA}}", dashboard_data)
                     .replace("{{DASHBOARD_TEXT}}", inline_json(dashboard_text[language]))
                     .replace("{{SCRIPT}}", dashboard_script))
        guide = make_methods_page(hours, plant, default["months"], default["annual"],
                                  "{{DASHBOARD_URL}}", guide_style, guide_script, language=language, sensitivity=sensitivity)
        snow_text = json.loads((web / "i18n" / language / "snow.json").read_text(encoding="utf-8"))
        snow = localized_template("snow.html", language).read_text(encoding="utf-8")
        options = []
        for temperature in supplies:
            value = f"{temperature:g}"
            label = value.replace(".", ",") if language in ("ru", "kk") else value
            options.append(f'<option value="{value}">{label}</option>')
        snow = (snow.replace("{{STYLE}}", snow_styles).replace("{{SUPPLY_OPTIONS}}", "".join(options))
                .replace("{{DATA}}", snow_payload).replace("{{SNOW_TEXT}}", inline_json(snow_text))
                .replace("{{MODEL}}", snow_model).replace("{{UI}}", snow_script))
        for directory, names in destinations:
            source_label = SOURCE_LINK_TEXT[language][0]
            source = f'<a href="source.zip" data-source-download download>{source_label}</a>' if directory == ROOT else ""
            for key, page in (("dashboard", dashboard), ("methods", guide), ("snow", snow)):
                page = apply_site_brand(page, language, names, key, PAGES).replace("{{SOURCE_LINK}}", source)
                (directory / names[key + suffix]).write_text(fill_page_urls(page, names, language), encoding="utf-8")
    for directory, names in destinations:
        build_lab_pages(directory, names, regional_data, tech_data, default, snow_reference, sensitivity, PAGES,
                        portable=directory != ROOT)
    if args.refresh_briefs:
        subprocess.run([sys.executable, str(ROOT / "make_research_briefs.py")], check=True)
    if args.downloads:
        copy_reference_files(args.downloads)
    package_site()
    print(f"Built {len(PAGES)} offline pages with six technology studies, {len(regional_data['stations'])} stations and {len(supplies)} supply settings.")


if __name__ == "__main__":
    main()
