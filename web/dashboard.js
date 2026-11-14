"use strict";
const study = JSON.parse(document.getElementById("case-data").textContent);
const plant = study.plant;
const byId = (id) => document.getElementById(id);
const labels = JSON.parse(byId("dashboard-text").textContent);
const language = document.documentElement.lang;
const {formatNumber, shortMonths: compactMonths, months: fullMonths} = window.SiteI18n;
const format = (value, digits = 0) => formatNumber(value, {
  minimumFractionDigits: digits, maximumFractionDigits: digits
});
const temperature = value => format(value, Number.isInteger(value) ? 0 : 1);
const message = (key, values) => labels[key].replace(/\{(\w+)\}/g, (_, field) => values[field]);
const slider = byId("supply");
const tooltip = byId("tip");
const svgNS = "http://www.w3.org/2000/svg";
const chartColours = {baseline: "#7b8c98", hybrid: "#00786f", assist: "#ba792a", mechanical: "#445666"};
let selected;

function svgNode(tag, attrs, text) {
  const element = document.createElementNS(svgNS, tag);
  Object.entries(attrs).forEach(([key, value]) => element.setAttribute(key, value));
  if (text !== undefined) element.textContent = text;
  return element;
}

function displayTip(event, label) {
  tooltip.textContent = label;
  tooltip.hidden = false;
  const rect = event.currentTarget.getBoundingClientRect();
  const x = event.type.startsWith("pointer") ? event.clientX : rect.left + rect.width / 2;
  const y = event.type.startsWith("pointer") ? event.clientY : rect.top + 20;
  tooltip.style.left = Math.max(4, Math.min(x + 12, window.innerWidth - tooltip.offsetWidth - 8)) + "px";
  tooltip.style.top = Math.max(4, Math.min(y + 12, window.innerHeight - tooltip.offsetHeight - 8)) + "px";
}

function plotMonthly(holder, rows, mode) {
  const width = Math.max(370, Math.round(holder.clientWidth));
  const height = width < 480 ? 185 : 205;
  const left = 34, right = 5, top = 16, bottom = height - 28;
  const space = (width - left - right) / 12;
  const max = mode === "hours" ? Math.max(...rows.map(r => r.hours)) :
    Math.max(...rows.map(r => r.baseline_mwh_e));
  const rough = max / 4;
  const power = Math.pow(10, Math.floor(Math.log10(rough)));
  const step = ([1, 2, 2.5, 5, 10].find(x => x * power >= rough) || 10) * power;
  const limit = Math.ceil(max / step) * step;
  const y = (v) => bottom - (bottom - top) * v / limit;
  const svg = svgNode("svg", {viewBox: "0 0 " + width + " " + height, role: "group",
    "aria-label": mode === "hours" ? labels.chartHours : labels.chartEnergy});
  for (let tick = 0; tick <= limit + step / 10; tick += step) {
    svg.append(svgNode("line", {x1: left, x2: width - right, y1: y(tick), y2: y(tick), class: "grid"}));
    svg.append(svgNode("text", {x: left - 5, y: y(tick) + 4, "text-anchor": "end"}, format(tick, step < 1 ? 1 : 0)));
  }
  rows.forEach((r, i) => {
    const x = left + (i + .5) * space;
    let label;
    if (mode === "hours") {
      let cumulative = 0;
      const stacks = [[r.off_hours, chartColours.hybrid], [r.assist_hours, chartColours.assist],
        [r.mechanical_hours, chartColours.mechanical]];
      for (const [value, colour] of stacks) {
        if (value) svg.append(svgNode("rect", {x: x - .30 * space, y: y(cumulative + value),
          width: .60 * space, height: y(cumulative) - y(cumulative + value), fill: colour}));
        cumulative += value;
      }
      label = message("hoursTip", {month: fullMonths[i], off: format(r.off_hours),
        assist: format(r.assist_hours), mechanical: format(r.mechanical_hours)});
    } else {
      [[r.baseline_mwh_e, chartColours.baseline, -.34], [r.hybrid_mwh_e, chartColours.hybrid, .02]]
        .forEach(([value, colour, offset]) => svg.append(svgNode("rect", {x: x + offset * space, y: y(value),
          width: .30 * space, height: bottom - y(value), fill: colour, rx: 1})));
      label = message("energyTip", {month: fullMonths[i], base: format(r.baseline_mwh_e, 1),
        hybrid: format(r.hybrid_mwh_e, 1)});
    }
    const tick = (language === "ru" || language === "kk") && space < 38 ? String(i + 1) : compactMonths[i];
    svg.append(svgNode("text", {x, y: bottom + 18, "text-anchor": "middle"}, tick));
    const hit = svgNode("rect", {x: x - space / 2, y: top, width: space, height: bottom - top,
      class: "hit", tabindex: 0, role: "img", "aria-label": label.replaceAll("\n", ". ")});
    for (const type of ["pointerenter", "pointermove", "focus"]) {
      hit.addEventListener(type, (e) => displayTip(e, label));
    }
    for (const type of ["pointerleave", "blur"]) hit.addEventListener(type, () => { tooltip.hidden = true; });
    hit.addEventListener("keydown", e => { if (e.key === "Escape") tooltip.hidden = true; });
    svg.append(hit);
  });
  holder.replaceChildren(svg);
}

function tableRow(r, period) {
  const tr = document.createElement("tr");
  const head = document.createElement("th");
  head.scope = "row";
  head.textContent = period;
  tr.append(head);
  const cells = [format(r.baseline_mwh_e, 1), format(r.hybrid_mwh_e, 1), format(r.savings_pct, 1),
    format(r.off_hours), format(r.assist_hours), format(r.mechanical_hours)];
  for (const text of cells) {
    const td = document.createElement("td");
    td.textContent = text;
    tr.append(td);
  }
  return tr;
}

function renderCharts() {
  tooltip.hidden = true;
  plotMonthly(byId("power-chart"), selected.months, "electricity");
  plotMonthly(byId("mode-chart"), selected.months, "hours");
}

function render() {
  const t = Number(slider.value);
  selected = study.scenarios.find(s => s.supply_c === t);
  const a = selected.annual;
  const tc = temperature(t);
  for (const link of document.querySelectorAll("[data-snow-link], .language-menu a[hreflang]")) {
    const destination = new URL(link.href);
    destination.searchParams.set("supply", String(t));
    link.href = destination.href;
  }
  if (/^https?:$/.test(location.protocol)) {
    const address = new URL(location.href);
    address.searchParams.set("supply", t);
    if (address.href !== location.href) history.replaceState(null, "", address);
  }
  byId("supply-value").innerHTML = tc + "<span> °C</span>";
  slider.setAttribute("aria-valuetext", message("degreesC", {temp: tc}));
  byId("down").disabled = t <= Number(slider.min);
  byId("up").disabled = t >= Number(slider.max);
  byId("reset").disabled = t === study.default_supply_c;
  const fullLimit = t - plant.rated_approach_k;
  const isEconomicAtFull = plant.it_kw > plant.chiller_cop * plant.dry_fan_kw;
  byId("threshold").textContent = message(isEconomicAtFull ? "threshold" : "thresholdConditional",
    {full: temperature(fullLimit)});
  const returnC = t + plant.loop_rise_k;
  const conductance = plant.it_kw / (plant.loop_rise_k + plant.rated_approach_k);
  const bypassC = returnC - plant.chiller_cop * plant.dry_fan_kw / conductance;
  const precise = value => formatNumber(value, {maximumFractionDigits: 3});
  byId("method-supply").textContent = tc + " °C";
  byId("method-thresholds").textContent = message(isEconomicAtFull ? "limits" : "limitsConditional", {
    returnC: precise(returnC), full: precise(fullLimit), bypass: precise(bypassC)
  });
  byId("savings").innerHTML = format(a.savings_pct, 1) + "<span>%</span>";
  byId("off").innerHTML = format(a.off_hours) + "<span> " + labels.shortHours + "</span>";
  byId("dry-share").innerHTML = format(a.dry_share_pct, 1) + "<span>%</span>";
  byId("saved-energy").textContent = message("savedEnergy", {value: format(a.savings_mwh_e)});
  byId("off-share").textContent = message("offShare", {value: format(a.off_pct, 1)});
  byId("dry-energy").textContent = message("dryEnergy", {value: format(a.dry_mwh_th)});
  byId("power-note").innerHTML = message("energySummary", {
    base: format(a.baseline_mwh_e, 1), hybrid: format(a.hybrid_mwh_e, 1)
  });
  byId("mode-note").innerHTML = message("modeSummary", {
    off: format(a.off_hours), assist: format(a.assist_hours), mechanical: format(a.mechanical_hours)
  });
  byId("table-body").replaceChildren(...selected.months.map((row, i) => tableRow(row, compactMonths[i])));
  byId("table-foot").replaceChildren(tableRow(a, labels.annual));
  renderCharts();
  byId("live").textContent = message("live", {temp: tc, saved: format(a.savings_pct, 1), off: format(a.off_hours)});
}

const assumptions = [
  [labels.fixedLoad, format(plant.it_kw) + " " + labels.powerUnit],
  [labels.loopRise, temperature(plant.loop_rise_k) + " " + labels.kelvin],
  [labels.approach, temperature(plant.rated_approach_k) + " " + labels.kelvin],
  [labels.chillerCop, format(plant.chiller_cop, 1)],
  [labels.fanPower, temperature(plant.dry_fan_kw) + " " + labels.powerUnit],
  [labels.loopPump, temperature(plant.loop_pump_kw) + " " + labels.powerUnit]
];
for (const [name, value] of assumptions) {
  const div = document.createElement("div"), term = document.createElement("dt"), def = document.createElement("dd");
  term.textContent = name; def.textContent = value;
  div.append(term, def); byId("assumptions").append(div);
}
document.querySelector('[data-val="load-mw"]').textContent = temperature(plant.it_kw / 1000);
const linkedSupply = new URLSearchParams(location.search).get("supply");
slider.value = linkedSupply !== null && linkedSupply.trim() && study.scenarios.some(s => s.supply_c === Number(linkedSupply))
  ? Number(linkedSupply) : study.default_supply_c;
slider.addEventListener("input", render);
byId("down").addEventListener("click", () => { slider.stepDown(); render(); });
byId("up").addEventListener("click", () => { slider.stepUp(); render(); });
byId("reset").addEventListener("click", () => { slider.value = study.default_supply_c; render(); });
byId("download").addEventListener("click", () => {
  const keys = Object.keys(selected.months[0]);
  const rows = selected.months.map((row, i) => ({...row, month: compactMonths[i]}));
  rows.push({...selected.annual, month: labels.annual});
  function csvCell(value) {
    if (typeof value === "number") return String(Number(value.toFixed(6)));
    return /[",\r\n]/.test(value) ? '"' + value.replaceAll('"', '""') + '"' : value;
  }
  const headers = keys.map(key => labels.csvColumns ? labels.csvColumns[key] : key);
  const lines = [headers.map(csvCell).join(","), ...rows.map(row => keys.map(key => csvCell(row[key])).join(","))];
  const url = URL.createObjectURL(new Blob([(language === "en" ? "" : "\uFEFF") + lines.join("\r\n") + "\r\n"],
    {type: "text/csv;charset=utf-8"}));
  const link = document.createElement("a");
  link.href = url; link.download = "astana-cooling-" + selected.supply_c + "C" + (language === "en" ? "" : "-" + language) + ".csv";
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
});
CaseShare.register(() => selected && ({
  params:new URLSearchParams({supply:slider.value}),
  details:[assumptions[0].join(" · "), byId("live").textContent, byId("power-note").textContent]
}));
render();
if (window.ResizeObserver) {
  let previousWidth = byId("power-chart").clientWidth;
  new ResizeObserver(() => {
    const width = byId("power-chart").clientWidth;
    if (width !== previousWidth) { previousWidth = width; renderCharts(); }
  }).observe(byId("power-chart"));
}
