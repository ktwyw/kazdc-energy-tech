"""Read and verify the hourly dry-bulb data used by the Astana reference case."""

import argparse
import calendar
import csv
import hashlib
import io
import math
import zipfile
from dataclasses import astuple, dataclass
from pathlib import Path
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parent
DATA_FILE = ROOT / "data" / "astana_hourly.csv"
STEM = "KAZ_AKM_Astana.351880_TMYx.2011-2025"
ARCHIVE_URL = ("https://climate.onebuilding.org/WMO_Region_2_Asia/"
               f"KAZ_Kazakhstan/AKM_Akmola/{STEM}.zip")
ARCHIVE_SHA256 = "3f756ff98391b1955f0c35aee60f4f85be28002c3f0f595f9194b33676435869"
EPW_SHA256 = "bdec2ff3187bca25d9e69995263204ee511f1300aaa04f73b0ab8a0de7ca249a"
FIELDS = ("source_year", "month", "day", "epw_hour", "dry_bulb_c")


@dataclass(frozen=True)
class WeatherHour:
    source_year: int
    month: int
    day: int
    epw_hour: int
    dry_bulb_c: float


def check_calendar(hours):
    """Require a complete, ordered, non-leap typical year at hourly resolution."""
    if len(hours) != 8760:
        raise ValueError(f"Expected 8,760 hourly records, found {len(hours):,}.")
    index = 0
    for month in range(1, 13):
        for day in range(1, calendar.monthrange(2001, month)[1] + 1):
            for hour in range(1, 25):
                row = hours[index]
                if (row.month, row.day, row.epw_hour) != (month, day, hour):
                    raise ValueError(f"Missing, duplicated or out-of-order hour at row {index + 1}.")
                if not math.isfinite(row.dry_bulb_c) or not -70 <= row.dry_bulb_c <= 70:
                    raise ValueError(f"Invalid or missing EPW dry-bulb temperature at row {index + 1}.")
                index += 1
    return hours


def read_weather(path=DATA_FILE):
    with Path(path).open(encoding="utf-8-sig", newline="") as stream:
        reader = csv.DictReader(stream)
        if reader.fieldnames != list(FIELDS):
            raise ValueError(f"Weather CSV must have these columns in order: {', '.join(FIELDS)}.")
        rows = [WeatherHour(int(r["source_year"]), int(r["month"]), int(r["day"]),
                            int(r["epw_hour"]), float(r["dry_bulb_c"])) for r in reader]
    return check_calendar(rows)


def extract_epw(raw):
    """Read the first four calendar fields and the seventh (dry-bulb) field."""
    reader = csv.reader(io.StringIO(raw.decode("utf-8-sig", errors="replace")))
    headers = [next(reader, []) for _ in range(8)]
    if not headers[0] or headers[0][0] != "LOCATION":
        raise ValueError("Missing EPW LOCATION header.")
    if headers[7][:3] != ["DATA PERIODS", "1", "1"]:
        raise ValueError("This case requires one EPW data period with one record per hour.")
    rows = []
    for line, row in enumerate(reader, start=9):
        if len(row) < 7:
            raise ValueError(f"Incomplete EPW record at line {line}.")
        rows.append(WeatherHour(int(row[0]), int(row[1]), int(row[2]), int(row[3]), float(row[6])))
    return check_calendar(rows)


def write_weather(hours, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as stream:
        writer = csv.writer(stream, lineterminator="\n")
        writer.writerow(FIELDS)
        writer.writerows(astuple(row) for row in hours)


def reference_epw():
    with urlopen(ARCHIVE_URL, timeout=60) as response:
        archive = response.read()
    if hashlib.sha256(archive).hexdigest() != ARCHIVE_SHA256:
        raise ValueError("The official archive differs from the pinned release. See data/README.md.")
    with zipfile.ZipFile(io.BytesIO(archive)) as source:
        epw = source.read(STEM + ".epw")
    if hashlib.sha256(epw).hexdigest() != EPW_SHA256:
        raise ValueError("EPW checksum mismatch.")
    return epw


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--download", action="store_true", help="fetch the pinned Astana archive")
    source.add_argument("--epw", type=Path, help="extract a local, non-leap, hourly EPW file")
    parser.add_argument("--output", type=Path, required=True, help="destination weather CSV")
    args = parser.parse_args()
    try:
        raw = reference_epw() if args.download else args.epw.read_bytes()
        rows = extract_epw(raw)
        write_weather(rows, args.output)
    except (OSError, ValueError, KeyError, zipfile.BadZipFile) as error:
        parser.exit(1, f"Weather error: {error}\n")
    print(f"Wrote {len(rows):,} hourly temperatures to {args.output}.")


if __name__ == "__main__":
    main()
