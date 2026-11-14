# 逐时湿度、气压和太阳辐射

[English](README.md) · [Қазақша](README.kk.md) · [Русский](README.ru.md) · 简体中文

这 21 份经 gzip 压缩的 CSV 文件补充了已有的城市干球温度记录。每份文件有 8,760 行，保留原始 EPW 的时间顺序，从文件所用当地标准时间 1 月 1 日的第 1 小时到 12 月 31 日的第 24 小时。站点清单链接至 Linda K. Lawrie 和 Drury B. Crawley 编制、由 Climate.OneBuilding 发布的原始 TMYx ZIP。清单记录气象来源、实际来源年份范围、经纬度、时区偏移量，以及每个 ZIP、EPW 和干球温度 CSV 的 SHA-256 摘要。[站点清单](../regions/stations.json) · [站点说明和原始气象文件](../regions/README.zh.md)

| CSV 列名 | EPW 字段（以年份为第 1 项） | 单位 |
|---|---|---|
| `relative_humidity_pct` | 9，相对湿度 | % |
| `station_pressure_pa` | 10，站点大气压力 | Pa |
| `ghi_wh_m2` | 14，水平面总太阳辐射量 | 每一小时内的 Wh/m² |

提取程序检查两份源文件的摘要，用该城市的基准数据核对每一个时间戳和干球温度，并检查新增字段的缺测值和异常范围。全部 183,960 条记录均通过检查。补充数据保留发布方提供的字段值，包括夜间的零辐射值。本版 TMYx 中，21 个地点的太阳辐射均来自 ERA5 再分析。全年太阳辐射量为各小时辐射量之和。冷水蓄冷模型利用 EPW 的时区偏移量，按哈萨克斯坦现行民用时间（UTC+5）设置蓄冷和释冷时段，月度结果仍按原始 EPW 月份汇总。[发布方来源说明](https://climate.onebuilding.org/sources/default.html) · [哈萨克斯坦民用时间](https://www.gov.kz/org/vko-shemonaiha-volchan/press/news/details/720058?lang=en)

`checksums.json` 中的 SHA-256 针对**解压后的 CSV 字节**，包括表头和 LF 换行符。[EnergyPlus EPW 数据字典](https://bigladdersoftware.com/epx/docs/24-2/auxiliary-programs/energyplus-weather-file-epw-data-dictionary.html)

太阳辐射时序检查使用站点经纬度及其固定的原始时区偏移，计算每个 EPW 小时开始和结束时的太阳高度角。六个文件在完全没有日照的时段仍有明显的正辐射量，涉及阿克套、阿特劳、科斯塔奈、乌拉尔斯克、突厥斯坦和热兹卡兹甘。例如，按源文件时间，阿特劳 3 月 31 日 06:00–07:00 的辐射量为 92 Wh/m²，而太阳高度角在整个时段均低于 −3°。能源模型保留公布数值，并在光伏模型中提示其逐时时序问题。[NOAA 太阳位置方程](https://gml.noaa.gov/grad/solcalc/solareqns.PDF)

构建时，`technology_weather.py` 使用每小时的干球温度、相对湿度及站点气压推算热力学湿球温度。程序在露点温度与干球温度之间采用二分法，求解 ASHRAE 的饱和状态和湿空气能量平衡方程，并根据条件选用冰面或液态水面分支。求解容差为 0.0001 °C，传输到页面时保留至 0.1 °C。因此湿球温度是计算所得的气象输入。每个站点在页面中存有三个经 base64 编码的数组，每个数组有 8,760 个小端序有符号 16 位整数。数组名为 `dry`、`wet`（单位步长为 0.1 °C）和 `solar`（Wh/m²）。[ASHRAE 方程及 PsychroLib 参考实现](https://psychrometrics.github.io/psychrolib/_modules/psychrolib.html)

要从指定版本的原始下载包重新生成补充数据，请在仓库根目录运行以下命令。如果 ZIP 分布在多个目录，可追加目录参数。常规网站构建直接使用随项目提供的提取数据，无需联网。

```bash
python technology_weather.py /path/to/weather-archives
```
