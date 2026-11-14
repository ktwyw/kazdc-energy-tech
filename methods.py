"""Supply the methods page with examples and totals from the reference simulation."""

import json
from dataclasses import asdict, replace
from functools import partial
from html import escape
from string import Template

from cooling import DEFAULT_SUPPLY_C, calculate, dispatch
from weather import ROOT


# Month, day and EPW hour as stored in the distributed weather series.
EXAMPLE_HOURS = ((1, 8, 14), (4, 13, 16), (6, 12, 3), (5, 21, 12), (4, 25, 19))


def number(value, places=1, *, language="en", fixed=False):
    display = f"{value:,.{places}f}"
    if places and not fixed:
        display = display.rstrip("0").rstrip(".")
    if language in ("ru", "kk"):
        display = display.translate(str.maketrans({",": "\u00a0", ".": ","}))
    return display


def worked_hours(weather, plant, supply, text):
    by_hour = {(h.month, h.day, h.epw_hour): h for h in weather}
    return_c = supply + plant.loop_rise_k
    coefficient = plant.it_kw / (plant.loop_rise_k + plant.rated_approach_k)
    heat_capacity_rate = plant.it_kw / plant.loop_rise_k
    examples = []
    for key in EXAMPLE_HOURS:
        hour = by_hour[key]
        result = dispatch(hour.dry_bulb_c, supply, plant)
        label = text["date"].format(day=hour.day, month=text["months"][hour.month - 1],
                                    year=hour.source_year, hour=hour.epw_hour)
        examples.append({
            "label": label, "outdoor": hour.dry_bulb_c, "return_c": return_c,
            "capacity": coefficient * max(0, return_c - hour.dry_bulb_c),
            "after_dry": return_c - result.dry_kw_th / heat_capacity_rate,
            "mode_label": text["modes"][result.mode], **asdict(result),
            "hybrid_kw_e": result.hybrid_kw_e,
        })
    return examples


def example_table(examples, fmt, text):
    rows = []
    for e in examples:
        cells = (f"{fmt(e['outdoor'])} °C", e["mode_label"], fmt(e["dry_kw_th"]),
                 fmt(e["chiller_kw_th"]), text["pct"].format(value=fmt(100 * e["fan_duty"])),
                 fmt(e["hybrid_kw_e"]))
        row = "".join(f"<td>{escape(str(cell))}</td>" for cell in cells)
        rows.append(f'<tr><th scope="row">{escape(e["label"])}</th>{row}</tr>')
    return "\n".join(rows)


def equipment_sensitivity(weather, plant, annual):
    results = {}
    for approach in sorted({3.0, plant.rated_approach_k, 7.0}):
        if approach == plant.rated_approach_k:
            results[approach] = annual
        else:
            alternative = replace(plant, rated_approach_k=approach)
            _, results[approach], _ = calculate(weather, DEFAULT_SUPPLY_C, alternative)
    return results


def sensitivity_rows(results, reference_approach, supply, fmt, text):
    rows = []
    for approach, result in results.items():
        label = text["reference" if approach == reference_approach else "approach"].format(value=fmt(approach))
        rows.append(f'<tr><th scope="row">{escape(label)}</th><td>{fmt(supply - approach)} °C</td>'
                    f'<td>{fmt(result["off_hours"], 0)}</td><td>{fmt(result["hybrid_mwh_e"], fixed=True)}</td></tr>')
    return "\n".join(rows)


def make_methods_page(weather, plant, months, annual, dashboard_url, style, script, language="en", *, sensitivity=None):
    web = ROOT / "web"
    text = json.loads((web / "i18n/methods-strings.json").read_text(encoding="utf-8"))[language]
    fmt = partial(number, language=language)
    fixed = partial(fmt, fixed=True)
    supply = DEFAULT_SUPPLY_C
    return_c = supply + plant.loop_rise_k
    coefficient = plant.it_kw / (plant.loop_rise_k + plant.rated_approach_k)
    break_even = plant.chiller_cop * plant.dry_fan_kw
    full_c = supply - plant.rated_approach_k
    bypass_c = return_c - break_even / coefficient
    regime_key = "regimes" if break_even < plant.it_kw else "no_assist"
    regimes = text[regime_key].format(full=fmt(full_c, 3), bypass=fmt(bypass_c, 3))
    july = months[6]
    examples = worked_hours(weather, plant, supply, text)
    options = [f'<option value="{i}"{" selected" if i == 2 else ""}>'
               f'{escape(e["label"])} · {fmt(e["outdoor"])} °C</option>'
               for i, e in enumerate(examples)]
    years = [str(hour.source_year) for hour in weather if hour.day == 1 and hour.epw_hour == 1]
    off_heat = annual["off_hours"] * plant.it_kw / 1000
    temps = [h.dry_bulb_c for h in weather]
    values = dict(
        dashboard_url=escape(dashboard_url, quote=True), style=style, script=script,
        load=fmt(plant.it_kw), supply=fmt(supply), rise=fmt(plant.loop_rise_k),
        approach=fmt(plant.rated_approach_k), return_c=fmt(return_c), cop=fmt(plant.chiller_cop),
        pump=fmt(plant.loop_pump_kw), fan=fmt(plant.dry_fan_kw), full_c=fmt(full_c, 3),
        bypass_c=fmt(bypass_c, 3), break_heat=fmt(break_even, 2),
        design_diff=fmt(plant.loop_rise_k + plant.rated_approach_k),
        coefficient=fmt(coefficient, 2), capacity_rate=fmt(plant.it_kw / plant.loop_rise_k, 2),
        base_chiller=fmt(plant.it_kw / plant.chiller_cop, 2),
        base_kw=fmt(plant.it_kw / plant.chiller_cop + plant.loop_pump_kw, 2),
        low=fmt(min(temps)), high=fmt(max(temps)), hours=fmt(len(temps), 0),
        years=text["years_separator"].join(years), off=fmt(annual["off_hours"], 0),
        assisted=fmt(annual["assist_hours"], 0), bypass=fmt(annual["mechanical_hours"], 0),
        off_pct=fixed(annual["off_pct"]), dry_pct=fixed(annual["dry_share_pct"]),
        saving_pct=fixed(annual["savings_pct"]), base_mwh=fixed(annual["baseline_mwh_e"], 2),
        hybrid_mwh=fixed(annual["hybrid_mwh_e"], 2), saving_mwh=fixed(annual["savings_mwh_e"], 2),
        chiller_mwh=fixed(annual["chiller_mwh_e"], 2), fan_mwh=fixed(annual["fan_mwh_e"], 2),
        pump_mwh=fixed(annual["pump_mwh_e"], 2), heat=fmt(len(temps) * plant.it_kw / 1000, 2),
        dry_heat=fixed(annual["dry_mwh_th"], 2), chiller_heat=fixed(annual["chiller_mwh_th"], 2),
        off_heat=fmt(off_heat, 2), assisted_heat=fixed(annual["dry_mwh_th"] - off_heat, 2),
        july_full=july["off_hours"], july_assist=july["assist_hours"], july_bypass=july["mechanical_hours"],
        july_hours=july["hours"], july_base=fixed(july["baseline_mwh_e"], 2),
        july_hybrid=fixed(july["hybrid_mwh_e"], 2), july_saved=fixed(july["savings_pct"]),
        example_rows=example_table(examples, fmt, text), hour_options="\n".join(options), regimes=escape(regimes),
        check_rows=sensitivity_rows(sensitivity or equipment_sensitivity(weather, plant, annual),
                                    plant.rated_approach_k, supply, fmt, text),
        trace_data=json.dumps({"examples": examples, "conductance": coefficient,
                               "cop": plant.chiller_cop, "break_even": break_even, "text": text,
                               "load": plant.it_kw, "fan": plant.dry_fan_kw},
                              separators=(",", ":"), allow_nan=False, ensure_ascii=False).replace("<", "\\u003c"),
    )
    directory = web if language == "en" else web / "i18n" / language
    source = (directory / "methods.html").read_text(encoding="utf-8")
    return Template(source).substitute(values)
