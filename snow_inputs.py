"""Prepare the existing plant dispatch and the audited SnowCool replay for the offline page."""

import argparse
import csv
import hashlib
import io
import json
import math
from pathlib import Path
from zipfile import ZipFile

from cooling import DEFAULT_SUPPLY_C, dispatch, write_csv
from weather import ROOT

REPLAY_FILE = ROOT / "data" / "snowcool_replay.csv"
TRACE_HASHES = {
    "reference": "a419b461737c35454761e18e83d826d03301917c8f5b32e9ec9991c9f8191574",
    "degraded": "bcd8c47aac2d84031dc20704e3656c17be98ffdcfdcc92ac8cff9f4529aae67b",
}


def extract_replay(archive_path, output_path):
    """Reduce the two archived 3.75-minute series to interval means and endpoint stocks."""
    rows = [{"hour": hour} for hour in range(169)]
    with ZipFile(archive_path) as archive:
        config = archive.read("data/example_evaluation.json")
        if hashlib.sha256(config).hexdigest() != "bca9f80f1d9478e4aef00d5c9a7a42b60396c6de3eb0b784bf180799eb8b1651":
            raise ValueError("Unexpected energy budget. Supply the audited v1.1 archive.")
        budget = json.loads(config)["energy_budget"]
        initial_kwh = budget["initial_energy_kwh"]
        for name, expected in TRACE_HASHES.items():
            raw = archive.read(f"data/timeseries_{name}.csv")
            if hashlib.sha256(raw).hexdigest() != expected:
                raise ValueError(f"Unexpected {name} trace. Supply the audited v1.1 archive.")
            points = list(csv.DictReader(io.StringIO(raw.decode("utf-8"))))
            if len(points) != 168 * 16 + 1:
                raise ValueError("Expected one start point and sixteen intervals per hour.")
            for hour, row in enumerate(rows):
                end = hour * 16
                if not math.isclose(float(points[end]["day"]), 120 + hour / 24):
                    raise ValueError("Unexpected replay interval.")
                row[f"{name}_ice_kwh"] = float(points[end]["ice_fraction"]) * initial_kwh
                for source, field in (("snow_kw_interval_mean", "snow_kw"),
                                      ("backup_kw_interval_mean", "backup_kw")):
                    samples = points[end - 15:end + 1] if hour else []
                    row[f"{name}_{field}"] = sum(float(p[source]) for p in samples) / 16 if hour else ""
    write_csv(output_path, rows)


def page_data(weather, plant, supplies):
    # Reuse the canonical Python dispatch. Each distinct temperature needs only one lookup.
    temperatures = sorted({hour.dry_bulb_c for hour in weather})
    index = {temp: i for i, temp in enumerate(temperatures)}
    supply_tables = {}
    for supply in supplies:
        results = [dispatch(temp, supply, plant) for temp in temperatures]
        supply_tables[f"{supply:g}"] = [
            [round(r.chiller_kw_th, 9), round(r.hybrid_kw_e, 9)] for r in results
        ]
    with REPLAY_FILE.open(encoding="utf-8", newline="") as stream:
        replay = [{key: (float(value) if value else None) for key, value in row.items()}
                  for row in csv.DictReader(stream)]
    return {
        "temperatures": temperatures, "indices": [index[h.dry_bulb_c] for h in weather],
        "years": [h.source_year for h in weather if h.day == 1 and h.epw_hour == 1],
        "supply_tables": supply_tables, "default_supply": DEFAULT_SUPPLY_C, "cop": plant.chiller_cop,
        "load_kw": plant.it_kw, "baseline_kw": plant.it_kw / plant.chiller_cop + plant.loop_pump_kw,
        "replay": replay,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Rebuild the hourly SnowCool replay from its audited archive.")
    parser.add_argument("archive", type=Path)
    parser.add_argument("--output", type=Path, default=REPLAY_FILE)
    args = parser.parse_args()
    extract_replay(args.archive, args.output)
