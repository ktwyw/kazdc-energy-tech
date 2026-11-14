# 阿斯塔纳逐时干球温度

[English](README.md) · [Қазақша](README.kk.md) · [Русский](README.ru.md) · 简体中文

参考算例使用 Climate.OneBuilding 发布的 **KAZ_AKM_Astana.351880_TMYx.2011-2025.epw**。Linda K. Lawrie 和 Drury B. Crawley 编制了 *Development of Global Typical Meteorological Years (TMYx)* 气象序列。发布方说明，典型年根据气象站逐时数据拼接而成，EPW 中其他气象变量还用到了补充资料。本算例只提取干球温度。[发布方与署名](https://climate.onebuilding.org/) · [TMYx 方法](https://climate.onebuilding.org/sources/default.html)

| EPW 项目 | 数值或说明 |
|---|---|
| 气象站 | 哈萨克斯坦阿斯塔纳（AKM），EPW 站点编号 351880 |
| 经纬度 | 北纬 51.17030°，东经 71.39420° |
| 海拔 | 355.1 m |
| 构建 TMYx 所用的资料时段 | 2011–2025 |
| 时间约定 | EPW 文件头指定当地标准时间 UTC+6。保留原始月、日及 EPW 小时序号（1–24）。源文件的分钟字段始终为 30。模型将每条记录视作一小时，不换算民用时间或夏令时。 |
| 保留数据 | 1 月至 12 月的 365 天，共 8,760 条记录 |
| 文件中干球温度的范围及均值 | −36.0 至 38.0 °C，均值为 4.1134 °C |

从 1 月到 12 月，所选月份的原始年份依次为 **2015、2021、2014、2017、2017、2022、2018、2019、2013、2020、2015、2014**。部分相邻月份来自不同年份。由此组成的 8,760 小时代表由不同年份的代表月拼成的典型年。源数据标志不足以确认每个逐时数值都是独立的观测值。

整理后的 CSV 包含来源年份、月、日、EPW 小时序号及干球温度（°C）。这些字段取自原始 EPW，整理为紧凑的 CSV。温度保留源数据的数值精度，未做插值、平滑或额外舍入。原始 ZIP 中的设计工况表及其他气象变量并非本模型所需。嵌入页面的结果和 CSV 均应注明数据出处。[原始 ZIP](https://climate.onebuilding.org/WMO_Region_2_Asia/KAZ_Kazakhstan/AKM_Akmola/KAZ_AKM_Astana.351880_TMYx.2011-2025.zip) · [气象数据分发与署名说明](https://weather-service.cscale.io/docs/attribution)

## 校验或重新提取数据

在项目目录中运行以下任一命令。下载模式检查 ZIP 与 EPW 的散列值。使用本地文件时，也可为独立情景提供其他完整、非闰年的逐时 EPW。针对不同地点或不同版本请使用不同的输出文件名。

```bash
python weather.py --download --output regenerated.csv
python weather.py --epw KAZ_AKM_Astana.351880_TMYx.2011-2025.epw --output local_extract.csv
```

| 文件 | SHA-256 |
|---|---|
| 发布的 ZIP | `3f756ff98391b1955f0c35aee60f4f85be28002c3f0f595f9194b33676435869` |
| 原始 EPW | `bdec2ff3187bca25d9e69995263204ee511f1300aaa04f73b0ab8a0de7ca249a` |
| 随附的 `astana_hourly.csv` | `be65cd8489856018590aa42304fd48baf0bce4377928801f8349b8595c11af1f` |

读取程序会拒绝缺少、重复或错序的小时，不完整年份，非有限温度值，以及超出 EPW 字段范围的干球温度。气象输入序列与数值模拟和面板结果分别存放。

## 复现 SnowCool 七天模拟

`snowcool_replay.csv` 包含 *Astana SnowCool — Physics-Guided Design of Seasonal Snow Storage for Data-Center Cooling in Astana*（经核查的 v1.1，2026 年 9 月 16 日）中的参考接触和接触退化两组模拟。规定的 120 天储存期和七天热负荷用于数值检验冰库存与逐时供冷功率之间的关系。

原始输入为容积 50 m³ 的立方体、300 mm 厚的保温层、每立方米 400 kg 冰当量，储存期为 120 天。目标是连续 168 小时提供 5 kW 冷量。源模型的熔化潜热为 334 kJ/kg，末期储备为 10%。独立的数据中心情景和三种储雪方式的七月储量对比采用 333.5 kJ/kg。[Feistel 关于 0 °C 冰熔化焓的研究](https://www.teos-10.org/pubs/Feistel_2003.pdf)

所提取的数据来自 `Astana_SnowCool_Audited_LaTeX_and_Code.zip` 中的 `data/timeseries_reference.csv` 和 `data/timeseries_degraded.csv`。压缩包的 SHA-256 为 `5b33c423ff76f28aafc10041d25765d17c9466d1140867bbe70826f76f08bf70`。提取脚本检查两份 CSV 的散列值，以及用于换算冰库存的 JSON 能量收支文件的散列值。每个小时的功率是 16 个等长 3.75 分钟区间的平均值。每小时末的储冰能量等于该时刻的冰量分数乘以源算例的初始潜热总量（1,855.5556 kWh）。第 0 小时表示储存期刚结束的状态，没有区间平均值。提取值保留六位小数。接触退化情景的逐时序列累计需要 8.156 kWh 备用供冷，结束时剩余 322.014 kWh 潜热。原研究中另一次较小步长的收敛性检验得到 8.166 kWh 备用供冷。两者保留一位小数都是 8.2 kWh。已有源数据包时，可按以下命令重建随附的提取结果。

```bash
python snow_inputs.py /path/to/Astana_SnowCool_Audited_LaTeX_and_Code.zip
```

在三个储雪示例中，带保温外套的容器、保温板储雪仓和带衬层与覆盖物的雪堆，其压实积雪的体积分别约为 55、60 和 50 m³。容器方案包括融雪水循环，其余两种用于说明被动储存方式。七月储量计算将用户设定的平均得热功率分别作用于每座储雪设施，持续 91 天。储雪和制冷研究所需数据均随项目提供。另见[区域气象站](regions/README.zh.md)。
