import csv
import hashlib
import io
import math
import unittest
from dataclasses import replace

from technology_weather import wet_bulb_c
from cooling import ASSIST, BYPASS, FULL, Plant, calculate, dispatch
from weather import DATA_FILE, check_calendar, extract_epw, read_weather


class PsychrometricTests(unittest.TestCase):
    def test_wet_bulb_near_freezing_and_at_saturation(self):
        # PsychroLib ASHRAE reference for a Petropavl record near the ice/water transition.
        self.assertAlmostEqual(wet_bulb_c(6.1, 26, 100223), 0.2454066, delta=.001)
        self.assertEqual(wet_bulb_c(-4, 100, 99800), -4)

    def test_wet_bulb_rounds_on_the_correct_side_of_a_half_tenth(self):
        # Typical-year records from Karaganda and Kyzylorda round in opposite directions.
        for inputs, expected in [((29.0, 23, 95377), 155), ((24.0, 30, 99835), 136)]:
            with self.subTest(inputs=inputs):
                self.assertEqual(round(wet_bulb_c(*inputs) * 10), expected)


class DispatchTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.plant = Plant.from_file()

    def test_rated_point_and_fan_cycling(self):
        rated = dispatch(13, 18, self.plant)
        self.assertEqual((rated.mode, rated.dry_kw_th, rated.fan_duty), (FULL, 1000, 1))
        self.assertEqual(rated.hybrid_kw_e, 40)
        cold = dispatch(2, 18, self.plant)
        self.assertEqual((cold.mode, cold.fan_duty, cold.hybrid_kw_e), (FULL, 0.5, 27.5))

    def test_half_capacity_and_break_even(self):
        half = dispatch(18.5, 18, self.plant)
        self.assertEqual((half.mode, half.dry_kw_th, half.chiller_kw_th), (ASSIST, 500, 500))
        self.assertEqual(half.hybrid_kw_e, 165)
        for outdoor in [22.9, 23, 24, 38]:
            result = dispatch(outdoor, 18, self.plant)
            self.assertEqual((result.mode, result.hybrid_kw_e, result.fan_duty), (BYPASS, 265, 0))
        self.assertEqual(dispatch(22.8, 18, self.plant).mode, ASSIST)

    def test_zero_and_expensive_fans(self):
        free_fan = replace(self.plant, dry_fan_kw=0)
        self.assertEqual(dispatch(23.9, 18, free_fan).mode, ASSIST)
        self.assertEqual(dispatch(24.0, 18, free_fan).mode, BYPASS)
        costly_fan = replace(self.plant, dry_fan_kw=300)
        self.assertEqual(dispatch(13, 18, costly_fan).mode, BYPASS)
        self.assertEqual(dispatch(2, 18, costly_fan).mode, FULL)

    def test_bad_inputs(self):
        for settings in [dict(chiller_cop=0), dict(loop_rise_k=-1), dict(dry_fan_kw=-1),
                         dict(it_kw=float("inf")), dict(loop_pump_kw=True)]:
            with self.subTest(settings=settings), self.assertRaises(ValueError):
                replace(self.plant, **settings)
        with self.assertRaises(ValueError):
            calculate([], float("nan"), self.plant)


class WeatherAndReferenceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.hours = read_weather()
        cls.plant = Plant.from_file()

    def test_pinned_weather(self):
        digest = hashlib.sha256(DATA_FILE.read_bytes()).hexdigest()
        self.assertEqual(digest, "be65cd8489856018590aa42304fd48baf0bce4377928801f8349b8595c11af1f")
        self.assertEqual((len(self.hours), self.hours[0].epw_hour, self.hours[-1].epw_hour), (8760, 1, 24))
        self.assertEqual((min(h.dry_bulb_c for h in self.hours), max(h.dry_bulb_c for h in self.hours)), (-36, 38))

    def test_invalid_calendar_and_temperature(self):
        for rows in [self.hours[:-1], [self.hours[1]] + self.hours[1:],
                     [replace(self.hours[0], dry_bulb_c=99.9)] + self.hours[1:]]:
            with self.assertRaises(ValueError):
                check_calendar(rows)
        with self.assertRaises(ValueError):
            extract_epw(b"bad header")

    def test_extract_epw_fields(self):
        stream = io.StringIO()
        writer = csv.writer(stream)
        writer.writerow(["LOCATION", "Test"])
        writer.writerows([["header"]] * 6)
        writer.writerow(["DATA PERIODS", 1, 1])
        for h in self.hours:
            writer.writerow([h.source_year, h.month, h.day, h.epw_hour, 30, "flags", h.dry_bulb_c, -77])
        self.assertEqual(extract_epw(stream.getvalue().encode("utf-8")), self.hours)

    def test_hourly_heat_electricity_and_counts(self):
        months, year, data = calculate(self.hours, 18, self.plant, hourly=True)
        for h in data:
            self.assertAlmostEqual(h["dry_kw_th"] + h["chiller_kw_th"], self.plant.it_kw)
            self.assertAlmostEqual(h["hybrid_kw_e"], h["pump_kw_e"] + h["chiller_kw_e"] + h["dry_fan_kw_e"])
            self.assertLessEqual(h["hybrid_kw_e"], h["baseline_kw_e"] + 1e-9)
            self.assertTrue(0 <= h["fan_duty"] <= 1)
        for r in months + [year]:
            self.assertEqual(r["off_hours"] + r["assist_hours"] + r["mechanical_hours"], r["hours"])
        self.assertEqual((year["off_hours"], year["assist_hours"], year["mechanical_hours"]), (5888, 1893, 979))
        self.assertAlmostEqual(year["baseline_mwh_e"], 265 * 8760 / 1000, places=7)
        self.assertAlmostEqual(year["hybrid_mwh_e"], 690.845738, places=5)
        for key in ("baseline_mwh_e", "hybrid_mwh_e", "off_hours", "dry_mwh_th"):
            self.assertAlmostEqual(year[key], sum(r[key] for r in months), places=7)

    def test_all_dashboard_setpoints_against_weather_thresholds(self):
        old_off = -1
        old_energy = math.inf
        for half_degree in range(16, 65):
            supply = half_degree / 2
            with self.subTest(supply=supply):
                _, year, _ = calculate(self.hours, supply, self.plant)
                # A 5 K rated approach and economic operation at full load.
                off = sum(h.dry_bulb_c <= supply - 5 for h in self.hours)
                # 100 kW of heat displaced just offsets the 25 kW fan at COP 4.
                bypass = sum(h.dry_bulb_c >= round(supply + 4.9, 1) for h in self.hours)
                self.assertEqual((year["off_hours"], year["mechanical_hours"]), (off, bypass))
                self.assertGreaterEqual(off, old_off)
                self.assertLessEqual(year["hybrid_mwh_e"], old_energy)
                old_off, old_energy = off, year["hybrid_mwh_e"]


if __name__ == "__main__":
    unittest.main()
