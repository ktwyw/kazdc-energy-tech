"""Hourly plant electricity and dry-cooling potential for a fixed IT heat load."""

import argparse
import csv
import json
import math
from dataclasses import asdict, dataclass
from pathlib import Path

from weather import DATA_FILE, ROOT, read_weather

MONTHS = ("Jan", "Feb", "Mar", "Apr", "May", "Jun",
          "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")
DEFAULT_SUPPLY_C = 18.0
FULL, ASSIST, BYPASS = "dry_only", "assisted", "chiller_only"


@dataclass(frozen=True)
class Plant:
    it_kw: float
    loop_rise_k: float
    rated_approach_k: float
    chiller_cop: float
    dry_fan_kw: float
    loop_pump_kw: float

    def __post_init__(self):
        for name, value in asdict(self).items():
            if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
                raise ValueError(f"{name} must be a finite number.")
            if name in ("dry_fan_kw", "loop_pump_kw"):
                if value < 0:
                    raise ValueError(f"{name} must be nonnegative.")
            elif value <= 0:
                raise ValueError(f"{name} must be positive.")

    @classmethod
    def from_file(cls, path=ROOT / "case.json"):
        return cls(**json.loads(Path(path).read_text(encoding="utf-8")))


@dataclass(frozen=True)
class Dispatch:
    mode: str
    dry_kw_th: float
    chiller_kw_th: float
    fan_duty: float
    dry_fan_kw_e: float
    chiller_kw_e: float
    pump_kw_e: float
    baseline_kw_e: float

    @property
    def hybrid_kw_e(self):
        return self.chiller_kw_e + self.dry_fan_kw_e + self.pump_kw_e


def dispatch(outdoor_c, supply_c, plant):
    """Dispatch one hour. The fan cycles in cold weather and the loop is buffered."""
    load = plant.it_kw
    return_c = supply_c + plant.loop_rise_k
    design_difference = plant.loop_rise_k + plant.rated_approach_k
    capacity = load * max(0.0, return_c - outdoor_c) / design_difference
    baseline = load / plant.chiller_cop + plant.loop_pump_kw
    # At equality, bypassing the dry cooler uses the same electricity.
    break_even_capacity = plant.dry_fan_kw * plant.chiller_cop
    if capacity <= break_even_capacity or math.isclose(capacity, break_even_capacity, rel_tol=1e-12):
        return Dispatch(BYPASS, 0.0, load, 0.0, 0.0, load / plant.chiller_cop,
                        plant.loop_pump_kw, baseline)
    if outdoor_c <= supply_c - plant.rated_approach_k:
        dry_heat = load
        mode = FULL
    else:
        dry_heat = min(load, capacity)
        mode = ASSIST
    duty = min(1.0, dry_heat / capacity)
    chiller_heat = load - dry_heat
    return Dispatch(mode, dry_heat, chiller_heat, duty, duty * plant.dry_fan_kw,
                    chiller_heat / plant.chiller_cop, plant.loop_pump_kw, baseline)


@dataclass
class Period:
    hours: int = 0
    off_hours: int = 0
    assist_hours: int = 0
    mechanical_hours: int = 0
    baseline_mwh_e: float = 0.0
    chiller_mwh_e: float = 0.0
    fan_mwh_e: float = 0.0
    pump_mwh_e: float = 0.0
    dry_mwh_th: float = 0.0
    chiller_mwh_th: float = 0.0

    def add(self, result):
        self.hours += 1
        self.off_hours += int(result.mode == FULL)
        self.assist_hours += int(result.mode == ASSIST)
        self.mechanical_hours += int(result.mode == BYPASS)
        # Every record spans one hour. Divide kW by 1000 to obtain MWh.
        self.baseline_mwh_e += result.baseline_kw_e / 1000
        self.chiller_mwh_e += result.chiller_kw_e / 1000
        self.fan_mwh_e += result.dry_fan_kw_e / 1000
        self.pump_mwh_e += result.pump_kw_e / 1000
        self.dry_mwh_th += result.dry_kw_th / 1000
        self.chiller_mwh_th += result.chiller_kw_th / 1000

    def record(self):
        record = asdict(self)
        hybrid = self.chiller_mwh_e + self.fan_mwh_e + self.pump_mwh_e
        saved = self.baseline_mwh_e - hybrid
        total_heat = self.dry_mwh_th + self.chiller_mwh_th
        record.update(hybrid_mwh_e=hybrid, savings_mwh_e=saved,
                      savings_pct=100 * saved / self.baseline_mwh_e,
                      dry_share_pct=100 * self.dry_mwh_th / total_heat,
                      off_pct=100 * self.off_hours / self.hours)
        return record


def calculate(hours, supply_c, plant, hourly=False):
    if not math.isfinite(supply_c):
        raise ValueError("Supply temperature must be finite.")
    periods = [Period() for _ in MONTHS]
    year = Period()
    detail = []
    for row in hours:
        result = dispatch(row.dry_bulb_c, supply_c, plant)
        periods[row.month - 1].add(result)
        year.add(result)
        if hourly:
            detail.append({**asdict(row), "supply_c": supply_c, **asdict(result),
                           "hybrid_kw_e": result.hybrid_kw_e})
    months = [{"month": name, "supply_c": supply_c, **period.record()}
              for name, period in zip(MONTHS, periods)]
    return months, {"supply_c": supply_c, **year.record()}, detail


def write_csv(path, records):
    with Path(path).open("w", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=records[0].keys(), lineterminator="\n")
        writer.writeheader()
        for row in records:
            writer.writerow({key: round(value, 6) if isinstance(value, float) else value
                             for key, value in row.items()})


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--supply", type=float, default=DEFAULT_SUPPLY_C, metavar="DEG_C")
    parser.add_argument("--case", type=Path, default=ROOT / "case.json")
    parser.add_argument("--weather", type=Path, default=DATA_FILE, help="complete hourly weather CSV")
    parser.add_argument("--output", type=Path, help="directory for hourly, monthly and annual CSVs")
    args = parser.parse_args()
    try:
        plant = Plant.from_file(args.case)
        months, year, detail = calculate(read_weather(args.weather), args.supply, plant, bool(args.output))
        if args.output:
            args.output.mkdir(parents=True, exist_ok=True)
            write_csv(args.output / "hourly.csv", detail)
            write_csv(args.output / "monthly.csv", months)
            write_csv(args.output / "annual.csv", [year])
    except (ValueError, TypeError, KeyError, OSError) as error:
        parser.exit(1, f"Case error: {error}\n")
    print(f"Supply {args.supply:g} °C | IT load {plant.it_kw:g} kW | {year['hours']:,} hours")
    print(f"Chiller only: {year['baseline_mwh_e']:,.1f} MWh electricity")
    print(f"Dry cooler + chiller: {year['hybrid_mwh_e']:,.1f} MWh electricity")
    print(f"Saved: {year['savings_mwh_e']:,.1f} MWh ({year['savings_pct']:.1f}%)")
    print(f"Dry heat rejection: {year['dry_mwh_th']:,.1f} MWh thermal ({year['dry_share_pct']:.1f}%)")
    print(f"Chiller off: {year['off_hours']:,} h | assisted: {year['assist_hours']:,} h | "
          f"chiller only: {year['mechanical_hours']:,} h")


if __name__ == "__main__":
    main()
