"use strict";

// This schema is shared by every language. Field IDs, valid ranges, result keys,
// numerical precision and source URLs must be identical for the same model.
const technologySchema = {
  pad: {
    inputs: [{id: "supply", label: "coolantSupply", unit: "°C", value: 18, min: 8, max: 32, step: 0.5},
      {id: "budget", label: "budget", unit: "m³", value: 300, min: 0, max: 20000, step: 1},
      {id: "effect", label: "padEffectiveness", unit: "%", value: 75, min: 0, max: 100, step: 1},
      {id: "trigger", label: "trigger", unit: "°C", value: 22, min: 10, max: 40, step: 0.5}],
    metrics: [["saved", "padMetricSaved", "MWh electric", 1],
      ["water", "padMetricWater", "m³", 1],
      ["extraOff", "padMetricExtraoff", "h", 0]],
    columns: [["reference", "padColumnReference", "MWh e"],
      ["plant", "padColumnPlant", "MWh e"],
      ["saved", "padColumnSaved", "MWh e"],
      ["water", "padMetricWater", "m³"],
      ["wetHours", "padColumnWethours", "h"],
      ["off", "padColumnOff", "h"],
      ["extraOff", "padColumnExtraoff", "h"]],
    chart: {title: "padChartTitle", unit: "MWh electric", lines: [["reference", "padColumnReference", "MWh e"], ["plant", "padColumnPlant", "MWh e"]]},
    sources: ["https://energyplus.readthedocs.io/en/v26.2.0/guides/engineering-reference/16.3-evaporative-coolers.html",
      "https://www.energy.gov/sites/default/files/2024-07/best-practice-guide-data-center-design.pdf"]
  },
  cold: {
    inputs: [{id: "heater", label: "heater", unit: "W", value: 300, min: 1, max: 10000, step: 0.1},
      {id: "flow", label: "flow", unit: "kg/s", value: 0.02, min: 0.001, max: 1, step: 0.001},
      {id: "inlet", label: "inlet", unit: "°C", value: 24, min: 1, max: 90, step: 0.1},
      {id: "outlet", label: "outlet", unit: "°C", value: 27, min: 1, max: 95, step: 0.1},
      {id: "plate", label: "plate", unit: "°C", value: 42, min: 1, max: 150, step: 0.1},
      {id: "drop", label: "drop", unit: "kPa", value: 20, min: 0, max: 500, step: 0.1},
      {id: "efficiency", label: "efficiency", unit: "%", value: 40, min: 1, max: 100, step: 1}],
    metrics: [["liquid", "coldMetricLiquid", "W", 1],
      ["capture", "coldMetricCapture", "%", 1],
      ["pump", "coldMetricPump", "W", 2]],
    columns: [["liquid", "coldMetricLiquid", "W"],
      ["capture", "coldColumnCapture", "%"],
      ["balance", "coldColumnBalance", "W"],
      ["delta", "coldColumnDelta", "K"],
      ["pump", "coldColumnPump", "W"],
      ["resistance", "coldColumnResistance", "K/W"]],
    sources: ["https://www.opencompute.org/documents/ocp-cold-plate-development-and-qualification-with-integrated-comments-pdf",
      "https://www.energy.gov/cmei/femp/cooling-water-efficiency-opportunities-federal-data-centers"]
  },
  air: {
    inputs: [{id: "supply", label: "referenceCoolantSupply", unit: "°C", value: 18, min: 8, max: 32, step: 0.5},
      {id: "airSupply", label: "airSupply", unit: "°C", value: 25, min: 16, max: 32, step: 0.5},
      {id: "airRise", label: "airRise", unit: "K", value: 10, min: 3, max: 20, step: 0.5},
      {id: "effect", label: "exchangerEffectiveness", unit: "%", value: 70, min: 0, max: 100, step: 1},
      {id: "fan", label: "fan", unit: "kW", value: 45, min: 0, max: 200, step: 1},
      {id: "frost", label: "frost", unit: "°C", value: -15, min: -40, max: 5, step: 1}],
    metrics: [["saved", "padMetricSaved", "MWh electric", 1],
      ["off", "airMetricOff", "h", 0],
      ["fans", "airMetricFans", "MWh electric", 1]],
    columns: [["reference", "padColumnReference", "MWh e"],
      ["plant", "padColumnPlant", "MWh e"],
      ["saved", "padColumnSaved", "MWh e"],
      ["fans", "airMetricFans", "MWh e"],
      ["compressor", "airColumnCompressor", "MWh e"],
      ["off", "padColumnOff", "h"],
      ["frostHours", "airColumnFrosthours", "h"]],
    chart: {title: "padChartTitle", unit: "MWh electric", lines: [["reference", "padColumnReference", "MWh e"], ["plant", "padColumnPlant", "MWh e"]]},
    sources: ["https://handbook.ashrae.org/Handbooks/A15/IP/A15_CH19/a15_ch19_ip.aspx",
      "https://energyplus.readthedocs.io/en/v26.2.0/guides/engineering-reference/16.8-heat-exchangers.html"]
  },
  glycol: {
    inputs: [{id: "mix", label: "mix", unit: "%", value: 30, options: [0, 20, 30, 40, 50, 60]},
      {id: "fluid", label: "fluid", unit: "°C", value: 20, min: 0, max: 30, step: 0.5},
      {id: "diameter", label: "diameter", unit: "m", value: 0.2, min: 0.1, max: 0.5, step: 0.01},
      {id: "length", label: "length", unit: "m", value: 100, min: 10, max: 1000, step: 1},
      {id: "efficiency", label: "efficiency", unit: "%", value: 75, min: 20, max: 95, step: 1},
      {id: "rise", label: "rise", unit: "K", value: 8, min: 6, max: 15, step: 0.5},
      {id: "duration", label: "duration", unit: "%", value: 50, min: 0, max: 100, step: 1}],
    metrics: [["variable", "glycolMetricVariable", "MWh electric/year", 2],
      ["ice", "glycolMetricIce", "°C", 2],
      ["exposure", "glycolMetricExposure", "h", 0]],
    columns: [["flow", "glycolColumnFlow", "L/s"],
      ["adjustedFlow", "glycolColumnAdjustedflow", "L/s"],
      ["drop", "glycolColumnDrop", "kPa"],
      ["rho", "glycolColumnRho", "kg/m³"],
      ["cp", "glycolColumnCp", "kJ/(kg·K)"],
      ["mu", "glycolColumnMu", "mPa·s"],
      ["reynolds", "glycolColumnReynolds", "–"],
      ["waterPump", "glycolColumnWaterpump", "kW"],
      ["pump", "glycolColumnPump", "kW"],
      ["adjustedPump", "glycolColumnAdjustedpump", "kW"],
      ["constant", "glycolColumnConstant", "MWh e/year"],
      ["variable", "glycolColumnVariable", "MWh e/year"],
      ["saved", "glycolColumnSaved", "MWh e/year"],
      ["waterEnergy", "glycolColumnWaterenergy", "MWh e/year"],
      ["ice", "glycolMetricIce", "°C"],
      ["exposure", "glycolMetricExposure", "h"]],
    sources: ["https://ingredi.com/content/pdfs/DOWFROST_Manual.pdf",
      "https://www.nist.gov/publications/reference-correlations-thermophysical-properties-liquid-water-01-mpa",
      "https://nepis.epa.gov/Exe/ZyPURL.cgi?Dockey=P10113EM.TXT"]
  },
  tank: {
    inputs: [{id: "supply", label: "coolantSupply", unit: "°C", value: 18, min: 8, max: 32, step: 0.5},
      {id: "volume", label: "volume", unit: "m³", value: 250, min: 0, max: 5000, step: 1},
      {id: "rate", label: "rate", unit: "kW thermal", value: 300, min: 0, max: 2000, step: 1},
      {id: "loss", label: "loss", unit: "%", value: 1, min: 0, max: 15, step: 0.1}],
    metrics: [["saved", "tankMetricSaved", "MWh electric", 1],
      ["peakAfter", "tankMetricPeakafter", "kW electric", 1],
      ["released", "tankMetricReleased", "MWh thermal", 1]],
    columns: [["reference", "padColumnReference", "MWh e"],
      ["plant", "padColumnPlant", "MWh e"],
      ["saved", "padColumnSaved", "MWh e"],
      ["charged", "tankColumnCharged", "MWh th"],
      ["released", "tankColumnReleased", "MWh th"],
      ["loss", "tankColumnLoss", "MWh th"],
      ["stock", "tankColumnStock", "MWh th"],
      ["peakBefore", "tankColumnPeakbefore", "kW e"],
      ["peakAfter", "tankMetricPeakafter", "kW e"]],
    chart: {title: "tankChartTitle", unit: "kW electric", lines: [["peakBefore", "padColumnReference"], ["peakAfter", "tankLegendPeakafter"]]},
    sources: ["https://handbook.ashrae.org/handbooks/S24/SI/s24_ch50/s24_ch50_si.aspx",
      "https://www.gov.kz/org/vko-shemonaiha-volchan/press/news/details/720058?lang=en"]
  },
  solar: {
    inputs: [{id: "supply", label: "coolantSupply", unit: "°C", value: 18, min: 8, max: 32, step: 0.5},
      {id: "area", label: "area", unit: "m²", value: 12000, min: 0, max: 100000, step: 10},
      {id: "battery", label: "battery", unit: "kWh", value: 2000, min: 0, max: 50000, step: 10},
      {id: "inverter", label: "inverter", unit: "kW AC", value: 600, min: 0, max: 10000, step: 10},
      {id: "reserve", label: "reserve", unit: "%", value: 20, min: 0, max: 100, step: 1}],
    metrics: [["grid", "solarMetricGrid", "MWh/year", 1],
      ["peakAfter", "solarMetricPeakafter", "kW", 1],
      ["discharge", "solarMetricDischarge", "MWh/year", 1]],
    columns: [["load", "solarColumnLoad", "MWh e"],
      ["pv", "solarColumnPv", "MWh e"],
      ["direct", "solarColumnDirect", "MWh e"],
      ["charge", "solarColumnCharge", "MWh e"],
      ["discharge", "solarColumnDischarge", "MWh e"],
      ["loss", "solarColumnLoss", "MWh e"],
      ["grid", "solarColumnGrid", "MWh e"],
      ["spill", "solarColumnSpill", "MWh e"],
      ["stock", "tankColumnStock", "MWh e"],
      ["peakBefore", "solarColumnPeakbefore", "kW"],
      ["peakAfter", "solarMetricPeakafter", "kW"]],
    chart: {title: "solarChartTitle", unit: "MWh electric", lines: [["load", "solarLegendLoad"], ["grid", "solarLegendGrid"]]},
    sources: ["https://research-hub.nlr.gov/en/publications/pvwatts-version-5-manual/",
      "https://samrepo.nlr.gov/help/pvwatts_system_design.html",
      "https://samrepo.nlr.gov/help/battery_dispatch_btm.html",
      "https://climate.onebuilding.org/sources/default.html",
      "https://gml.noaa.gov/grad/solcalc/solareqns.PDF"]
  }
};

function technologyStudies(text, plant, locale, format = (value, options) => value.toLocaleString(locale, options)) {
  const constants = {
    IT_MW: format(plant.it_kw / 1000, {useGrouping: false}),
    LOOP_RISE: format(plant.loop_rise_k, {useGrouping: false})
  };
  const expand = value => value.replace(/\{\{(IT_MW|LOOP_RISE)\}\}/g, (_, name) => constants[name]);
  const label = key => expand(text.labels[key]);
  const unit = key => text.units[key];
  function columns(entries) {
    return entries.map(([key, name, symbol, ...precision]) => [key, label(name), unit(symbol), ...precision]);
  }
  const studies = {};
  for (const [key, schema] of Object.entries(technologySchema)) {
    const copy = text.studies[key];
    const study = {
      nav: copy.nav, category: copy.category, title: copy.title, question: copy.question,
      assumptions: expand(copy.assumptions),
      inputs: schema.inputs.map(input => ({...input, label: label(input.label), unit: unit(input.unit)})),
      metrics: columns(schema.metrics), columns: columns(schema.columns),
      method: copy.method.map(([heading, paragraph]) => [heading, expand(paragraph)]),
      sources: schema.sources.map((url, i) => [url, copy.sources[i]])
    };
    if (schema.chart) {
      study.chart = {
        title: label(schema.chart.title), unit: unit(schema.chart.unit),
        lines: schema.chart.lines.map(([key, name, symbol]) => symbol ? [key, label(name), unit(symbol)] : [key, label(name)])
      };
    }
    studies[key] = study;
  }
  return studies;
}

if (typeof module !== "undefined" && module.exports) module.exports = technologyStudies;
