# Astana hourly dry-bulb temperatures

English · [Қазақша](README.kk.md) · [Русский](README.ru.md) · [简体中文](README.zh.md)

The reference case uses **KAZ_AKM_Astana.351880_TMYx.2011-2025.epw**, distributed by Climate.OneBuilding. Linda K. Lawrie and Drury B. Crawley compiled the *Development of Global Typical Meteorological Years (TMYx)* weather series. The publisher describes the typical year as assembled from hourly station data, with additional meteorological inputs for other EPW variables. This case extracts dry bulb only. [Publisher attribution](https://climate.onebuilding.org/) · [TMYx methodology](https://climate.onebuilding.org/sources/default.html)

| EPW field | Value |
|---|---|
| Station | Astana, AKM, Kazakhstan, EPW station ID 351880 |
| Coordinates | 51.17030° N, 71.39420° E |
| Elevation | 355.1 m |
| Period used to construct the TMYx | 2011–2025 |
| Time convention | The EPW header specifies local standard time, UTC+6. Original month, day and EPW hour index (1–24) are preserved. The source minute field is 30 throughout. The model assigns one hour to each record with no civil-time or DST conversion. |
| Retained data | 8,760 records covering 365 days, January through December |
| Dry-bulb range and mean in this file | −36.0 to 38.0 °C, mean 4.1134 °C |

Source years for January through December are **2015, 2021, 2014, 2017, 2017, 2022, 2018, 2019, 2013, 2020, 2015 and 2014**. The source year changes across some month boundaries. The resulting 8,760-hour series represents a typical year assembled from representative months from different years. The source flags do not establish that every hourly value is an individual observation.

The adapted CSV contains source year, month, day, EPW hour and dry bulb in °C. It was created by selecting these fields from the original EPW and formatting them as a compact CSV. No temperatures were interpolated, smoothed or rounded beyond the numeric precision of the source. The accompanying ZIP archive's design tables and other weather variables are unnecessary for this model. Attribution applies to the embedded results as well as the CSV. [Original ZIP](https://climate.onebuilding.org/WMO_Region_2_Asia/KAZ_Kazakhstan/AKM_Akmola/KAZ_AKM_Astana.351880_TMYx.2011-2025.zip) · [Weather distribution and attribution notes](https://weather-service.cscale.io/docs/attribution)

## Verify or recreate the extract

From the project directory, run either command below. The download command checks both the archive and EPW hashes. The local-file mode also accepts another complete non-leap hourly EPW for a separate scenario. Give a different location or vintage its own output name.

```bash
python weather.py --download --output regenerated.csv
python weather.py --epw KAZ_AKM_Astana.351880_TMYx.2011-2025.epw --output local_extract.csv
```

| File | SHA-256 |
|---|---|
| Published ZIP | `3f756ff98391b1955f0c35aee60f4f85be28002c3f0f595f9194b33676435869` |
| Original EPW | `bdec2ff3187bca25d9e69995263204ee511f1300aaa04f73b0ab8a0de7ca249a` |
| Included `astana_hourly.csv` | `be65cd8489856018590aa42304fd48baf0bce4377928801f8349b8595c11af1f` |

The file reader rejects missing, repeated or disordered hours, incomplete years, non-finite temperatures and dry-bulb values outside the EPW field range. Numerical simulations and dashboard results are separate from the input weather series.

## SnowCool seven-day replay

`snowcool_replay.csv` contains the reference-contact and degraded-contact simulations from *Astana SnowCool — Physics-Guided Design of Seasonal Snow Storage for Data-Center Cooling in Astana*, audited v1.1, 16 September 2026. Its prescribed 120-day hold and seven-day heat load provide a numerical benchmark for the relationship between ice inventory and hourly cooling power.

The original inputs describe a 50 m³ cube with 300 mm insulation, 400 kg ice equivalent per m³ and a 120-day hold. The target is 5 kW for 168 hours. The source uses 334 kJ/kg latent heat and a 10% terminal reserve. The separate data-centre scenario and three-store July inventory comparison use 333.5 kJ/kg. [Feistel, ice melting enthalpy at 0 °C](https://www.teos-10.org/pubs/Feistel_2003.pdf)

The extracted data use `data/timeseries_reference.csv` and `data/timeseries_degraded.csv` from `Astana_SnowCool_Audited_LaTeX_and_Code.zip`, SHA-256 `5b33c423ff76f28aafc10041d25765d17c9466d1140867bbe70826f76f08bf70`. The extraction script checks both source CSV hashes and the hash of the JSON energy budget used to scale ice inventory. An hour is the equal-duration mean of sixteen 3.75-minute intervals. Ice energy is the end-of-hour ice fraction times the source case's initial latent inventory (1,855.5556 kWh). Hour zero is the state just after the hold and has no interval means. Six decimal places are retained in the extract. The degraded hourly series integrates to 8.156 kWh of backup and finishes with 322.014 kWh of latent inventory. A separate finer-step convergence run in the original study gives 8.166 kWh of backup. Both round to 8.2 kWh. With the source package, reproduce the bundled extract with:

```bash
python snow_inputs.py /path/to/Astana_SnowCool_Audited_LaTeX_and_Code.zip
```

The three storage examples use approximate compacted snow volumes of 55 m³ for a jacketed container, 60 m³ for an insulated panel store and 50 m³ for a lined, covered pile. The container design includes meltwater circulation. The other two designs illustrate passive storage. The July calculation applies a user-entered mean heat gain to each store for 91 days. The snow and cooling studies run from the data bundled in the project. See also the [regional weather stations](regions/README.md).
