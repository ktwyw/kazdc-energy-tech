# Hourly humidity, pressure and solar radiation

English · [Қазақша](README.kk.md) · [Русский](README.ru.md) · [简体中文](README.zh.md)

These 21 gzip-compressed CSV files supplement the existing city dry-bulb records. Each contains 8,760 rows in the original EPW order, from January 1, hour 1 to December 31, hour 24 in the file's local standard time. The station manifest links to the original Climate.OneBuilding TMYx ZIPs compiled by Linda K. Lawrie and Drury B. Crawley. It records the weather source, actual source-year period, coordinates, time offset and SHA-256 digests of each archive, EPW and dry-bulb CSV. [Station manifest](../regions/stations.json) · [Station notes and original weather files](../regions/README.md)

| CSV column | EPW field (counting Year as field 1) | Units |
|---|---|---|
| `relative_humidity_pct` | 9, relative humidity | % |
| `station_pressure_pa` | 10, atmospheric station pressure | Pa |
| `ghi_wh_m2` | 14, global horizontal radiation | Wh/m² over the one-hour interval |

The extractor checks both source digests, matches every timestamp and dry-bulb value against the canonical city file, and checks the new columns for missing values and implausible ranges. All 183,960 records passed. The supplements retain the publisher's field values, including nighttime solar zeros. In this TMYx edition solar radiation comes from ERA5 reanalysis for all 21 locations. The annual solar total is the sum of the hourly values. The tank uses the EPW offset to apply charge and discharge windows in present Kazakhstan civil time (UTC+5), while reporting by the original EPW month. [Publisher’s source notes](https://climate.onebuilding.org/sources/default.html) · [Kazakhstan civil time](https://www.gov.kz/org/vko-shemonaiha-volchan/press/news/details/720058?lang=en) SHA-256 values in `checksums.json` apply to the **decompressed CSV bytes**, including the header and LF line endings. [EnergyPlus EPW data dictionary](https://bigladdersoftware.com/epx/docs/24-2/auxiliary-programs/energyplus-weather-file-epw-data-dictionary.html)

The solar timing check compares the start and end solar elevations of each EPW hour with the site coordinates and the fixed source-clock offset. Six files contain appreciable positive irradiation in intervals entirely outside daylight: Aktau, Atyrau, Kostanay, Oral, Turkistan and Zhezkazgan. For example, Atyrau’s 06:00–07:00 source interval on 31 March contains 92 Wh/m² despite solar elevation below −3° throughout. The energy model retains the published values and flags the hourly timing in the PV workbench. [NOAA solar-position equations](https://gml.noaa.gov/grad/solcalc/solareqns.PDF)

At build time `technology_weather.py` derives the thermodynamic wet-bulb temperature from each hour’s dry-bulb temperature, relative humidity and station pressure. It solves the ASHRAE saturation and moist-air energy-balance equations by bisection between dew point and dry bulb, switching between ice and liquid water as appropriate. The solver tolerance is 0.0001 °C. The page rounds the result to 0.1 °C for transport. Wet bulb is thus a calculated weather input. For each station the page stores three base64-encoded arrays of 8,760 little-endian signed 16-bit integers. The array names are `dry` and `wet` (0.1 °C) and `solar` (Wh/m²). [ASHRAE equations and PsychroLib reference implementation](https://psychrometrics.github.io/psychrolib/_modules/psychrolib.html)

To regenerate the supplements from the pinned downloads, run the command below from the repository root. Pass additional directories if the ZIPs are stored in more than one folder. The normal site build uses the extracts offline.

```bash
python technology_weather.py /path/to/weather-archives
```
