"""Build hourly technology-study weather from the pinned Kazakhstan EPW files."""

import argparse
import base64
import csv
import gzip
import hashlib
import io
import json
import math
import struct
from pathlib import Path
from urllib.parse import urlsplit
from zipfile import ZipFile

from weather import ROOT, read_weather


SUPPLEMENT_DIR = ROOT / "data" / "technology-weather"
FIELDS = ["relative_humidity_pct", "station_pressure_pa", "ghi_wh_m2"]


def saturation_pressure_pa(temp_c):
    """ASHRAE Fundamentals 2017, chapter 1, eqs. 5 and 6 (ice and liquid)."""
    k = temp_c + 273.15
    if temp_c <= 0.01:
        log_pa = (-5674.5359 / k + 6.3925247 - 0.009677843 * k
                  + 6.2215701e-7 * k**2 + 2.0747825e-9 * k**3
                  - 9.484024e-13 * k**4 + 4.1635019 * math.log(k))
    else:
        log_pa = (-5800.2206 / k + 1.3914993 - 0.048640239 * k
                  + 4.1764768e-5 * k**2 - 1.4452093e-8 * k**3
                  + 6.5459673 * math.log(k))
    return math.exp(log_pa)


def wet_bulb_c(dry, rh_pct, pressure_pa):
    """Solve the ASHRAE adiabatic-saturation balance at the hourly station pressure."""
    if rh_pct == 100:
        return dry
    vapour_pa = rh_pct / 100 * saturation_pressure_pa(dry)
    target = 0.621945 * vapour_pa / (pressure_pa - vapour_pa)
    # Resolve records very close to a half-tenth before encoding the result at 0.1 °C.
    tolerance_c = 1e-9
    dew_low, dew_high = -100.0, dry
    while dew_high - dew_low > tolerance_c:
        probe = (dew_low + dew_high) / 2
        if saturation_pressure_pa(probe) < vapour_pa:
            dew_low = probe
        else:
            dew_high = probe
    low, high = (dew_low + dew_high) / 2, dry
    while high - low > tolerance_c:
        wet = (low + high) / 2
        saturated_pa = saturation_pressure_pa(wet)
        saturated = 0.621945 * saturated_pa / (pressure_pa - saturated_pa)
        # Saturation over liquid water and over ice use distinct heat balances.
        if wet >= 0:
            candidate = ((2501.0 - 2.326 * wet) * saturated - 1.006 * (dry - wet)) / (
                2501.0 + 1.86 * dry - 4.186 * wet)
        else:
            candidate = ((2830.0 - 0.24 * wet) * saturated - 1.006 * (dry - wet)) / (
                2830.0 + 1.86 * dry - 2.1 * wet)
        if candidate < target:
            low = wet
        else:
            high = wet
    return (low + high) / 2


def checked_extra(values):
    """The pinned EPW fields are all integral. Fail on missing or invalid fields."""
    rh, pressure, solar = map(int, values)
    if not (0 <= rh <= 100 and 31000 <= pressure <= 120000 and 0 <= solar <= 1500):
        raise ValueError(f"Invalid relative humidity, station pressure or hourly GHI: {values}")
    return rh, pressure, solar


def digest(contents):
    return hashlib.sha256(contents).hexdigest()


def checked_dry(station):
    path = ROOT / station["csv"]
    if digest(path.read_bytes()) != station["csv_sha256"]:
        raise ValueError(f"Dry-bulb CSV checksum mismatch for {station['name']}")
    return read_weather(path)


def from_archive(station, archive_path):
    archive = archive_path.read_bytes()
    if digest(archive) != station["archive_sha256"]:
        raise ValueError(f"Archive checksum mismatch for {station['name']}")
    with ZipFile(io.BytesIO(archive)) as zipped:
        epw_name, = (m for m in zipped.namelist() if m.lower().endswith(".epw"))
        raw = zipped.read(epw_name)
    if digest(raw) != station["epw_sha256"]:
        raise ValueError(f"EPW checksum mismatch for {station['name']}")
    rows = csv.reader(io.StringIO(raw.decode("utf-8-sig")))
    for _ in range(8):
        next(rows)
    output = io.StringIO(newline="")
    writer = csv.writer(output, lineterminator="\n")
    writer.writerow(FIELDS)
    for dry, row in zip(checked_dry(station), rows, strict=True):
        stamp = (dry.source_year, dry.month, dry.day, dry.epw_hour)
        if stamp != tuple(map(int, row[:4])) or dry.dry_bulb_c != float(row[6]):
            raise ValueError(f"Misaligned EPW for {station['name']} at {stamp}")
        writer.writerow(checked_extra([row[8], row[9], row[13]]))
    return output.getvalue().encode("ascii")


def regenerate(stations, archive_dirs, output_dir):
    output_dir.mkdir(parents=True, exist_ok=True)
    archived = {p.name: p for directory in archive_dirs for p in directory.glob("*.zip")}
    checksums = {}
    for station in stations:
        name = Path(urlsplit(station["source_url"]).path).name
        if name not in archived:
            raise FileNotFoundError(f"Missing pinned archive {name}")
        contents = from_archive(station, archived[name])
        slug = station["slug"]
        (output_dir / f"{slug}.csv.gz").write_bytes(gzip.compress(contents, mtime=0))
        checksums[slug] = digest(contents)
    (output_dir / "checksums.json").write_text(
        json.dumps(checksums, sort_keys=True, indent=2) + "\n", encoding="ascii")


def encode_int16(values):
    return base64.b64encode(struct.pack(f"<{len(values)}h", *values)).decode("ascii")


def technology_weather(stations, directory=SUPPLEMENT_DIR):
    """Map each slug to dry, wet (0.1 °C), and solar (Wh/m²) little-endian Int16 arrays."""
    checksums = json.loads((directory / "checksums.json").read_text(encoding="utf-8"))
    result = {}
    for station in stations:
        slug = station["slug"]
        dry = checked_dry(station)
        with gzip.open(directory / f"{slug}.csv.gz", "rb") as weather:
            contents = weather.read()
        if digest(contents) != checksums[slug]:
            raise ValueError(f"Supplemental weather checksum mismatch for {slug}")
        reader = csv.reader(io.StringIO(contents.decode("ascii")))
        if next(reader) != FIELDS:
            raise ValueError(f"Unexpected supplemental weather columns for {slug}")
        dry_values, wet_values, solar_values = [], [], []
        for hour, row in zip(dry, reader, strict=True):
            rh, pressure, solar = checked_extra(row)
            dry_values.append(round(hour.dry_bulb_c * 10))
            wet_values.append(round(wet_bulb_c(hour.dry_bulb_c, rh, pressure) * 10))
            solar_values.append(solar)
        result[slug] = {"utc_offset": station["utc_offset"], "dry": encode_int16(dry_values), "wet": encode_int16(wet_values),
                        "solar": encode_int16(solar_values)}
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive_dirs", nargs="+", type=Path, help="folders holding the station archives")
    parser.add_argument("--output", type=Path, default=SUPPLEMENT_DIR, help="supplemental weather folder")
    args = parser.parse_args()
    manifest = json.loads((ROOT / "data" / "regions" / "stations.json").read_text(encoding="utf-8"))
    regenerate(manifest, args.archive_dirs, args.output)
