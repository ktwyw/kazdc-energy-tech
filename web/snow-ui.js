"use strict";
(() => {
  const data = JSON.parse(document.getElementById("snow-data").textContent);
  const get = id => document.getElementById(id);
  const text = JSON.parse(get("snow-text").textContent);
  const language = document.documentElement.lang;
  const {locale, months, formatNumber} = window.SiteI18n;
  const put = (id, text) => { get(id).textContent = text; };
  const message = (key, values) => text[key].replace(/\{(\w+)\}/g, (_, name) => values[name]);
  const format = (value, digits = 0) => formatNumber(value, {
    minimumFractionDigits: digits, maximumFractionDigits: digits
  });
  const quantity = (value, unit, digits = 0) => format(value, digits) + " " + text.units[unit];
  const thermalMwh = value => quantity(value / 1000, "mwh", 1);
  const compactNumber = value => message("thousands", {
    value:formatNumber(value / 1000, {maximumFractionDigits:1})
  });
  const calendar = new Intl.DateTimeFormat(locale, {month:"short", day:"numeric", timeZone:"UTC"});
  const periodName = name => name === "Annual" ? text.annual : text.periods[SnowModel.months.indexOf(name)];
  const form = get("facility-form");
  let current = null;

  function element(name, attributes, text) {
    const node = document.createElementNS("http://www.w3.org/2000/svg", name);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function lineChart(holder, values, title, labels, options = {}) {
    const width = Math.max(250, holder.clientWidth);
    const height = options.height || 134;
    const left = 45, right = width - 14, top = 11, bottom = height - 23;
    const max = options.max || Math.max(...values, 1);
    const stroke = options.stroke || "#00786f";
    const x = i => left + (right - left) * i / (values.length - 1);
    const y = n => bottom - n * (bottom - top) / max;
    const svg = element("svg", {viewBox: "0 0 " + width + " " + height, role: "img",
      "aria-label": title});
    svg.append(element("title", {}, title));
    for (const fraction of [0, 0.5, 1]) {
      const val = max * fraction;
      svg.append(element("line", {x1: left, x2: right, y1: y(val), y2: y(val), stroke: "#d8e4db"}));
      const numeric = val >= 10000 ? compactNumber(val) : format(val, max <= 10 && val % 1 ? 1 : 0);
      svg.append(element("text", {x: left - 6, y: y(val) + 4, "text-anchor": "end"}, numeric));
    }
    const path = values.map((val, i) => (i ? "L" : "M") + x(i).toFixed(2) + " " + y(val).toFixed(2)).join(" ");
    if (options.fill) svg.append(element("path", {d: path + " L" + right + " " + bottom +
      " L" + left + " " + bottom + " Z", fill: "#c7e5d4", opacity: 0.75}));
    svg.append(element("path", {d: path, fill: "none", stroke, "stroke-width": 2.5}));
    for (const [i, label] of labels) {
      const anchor = i === 0 ? "start" : i === values.length - 1 ? "end" : "middle";
      svg.append(element("text", {x:x(i), y:bottom + 17, "text-anchor":anchor}, label));
    }
    if (options.cursor !== undefined) {
      const j = options.cursor;
      svg.append(element("line", {x1:x(j), x2:x(j), y1:top, y2:bottom, stroke:"#657c72",
        "stroke-dasharray":"3 4"}));
      svg.append(element("circle", {cx:x(j), cy:y(values[j]), r:4, fill:stroke, stroke:"white"}));
    }
    holder.replaceChildren(svg);
  }

  function clearFacility() {
    current = null;
    for (const id of ["net-saved", "snow-heat", "added-hours", "peak-duty", "target-volume"]) put(id, "—");
    for (const id of ["saving-split", "total-hours", "snow-share", "stock-note", "target-note",
                       "stock-chart", "snow-months", "snow-year"]) get(id).replaceChildren();
    get("snow-download").disabled = true;
    get("apply-target").disabled = true;
  }

  function monthlyRow(period) {
    const tr = document.createElement("tr");
    const powers = get("monthly-meter").value === "chiller"
      ? [period.hours * data.load_kw / data.cop,
         period.residual / data.cop, period.remainingDuty / data.cop]
      : [period.baseline, period.hybrid, period.withSnow];
    const cells = [periodName(period.name), ...powers.map(kwh => format(kwh / 1000, 2)),
      format(period.snow / 1000, 2), format(period.extraOff),
      format(period.peak, 1)];
    cells.forEach((value, i) => {
      const cell = document.createElement(i === 0 ? "th" : "td");
      if (i === 0) cell.scope = "row";
      cell.textContent = value;
      tr.append(cell);
    });
    return tr;
  }

  function renderMonths() {
    const chiller = get("monthly-meter").value === "chiller";
    put("monthly-boundary", chiller ? text.monthlyChiller : text.monthlyPlant);
    if (current) {
      get("snow-months").replaceChildren(...current.result.periods.map(monthlyRow));
      get("snow-year").replaceChildren(monthlyRow(current.result.annual));
    }
  }

  function drawStock() {
    if (!current) return;
    const {dailyStock} = current.result;
    lineChart(get("stock-chart"), dailyStock.map(kwh => kwh / 1000),
      message("stockChart", {note:get("stock-note").textContent}),
      [0,30,61,92].map((day, i) => [day, text.stockDates[i]]), {fill:true, height:112});
  }

  function renderFacility() {
    const hot = get("snow-policy").value === "hot-hours";
    get("hot-control").hidden = !hot;
    form.elements.threshold.disabled = !hot;
    const error = get("invalid-case");
    const invalid = Array.from(form.elements).find(field => field.willValidate && !field.validity.valid);
    error.hidden = !invalid;
    if (invalid) {
      error.textContent = message("invalid", {field:invalid.labels[0]?.firstChild.textContent.trim() || text.field});
      clearFacility();
      return;
    }
    const input = SnowModel.defaultCase(data);
    for (const key of Object.keys(input)) {
      const control = form.elements.namedItem(key);
      if (!control.disabled) input[key] = key === "policy" ? control.value : Number(control.value);
    }
    const result = SnowModel.simulate(data, input);
    current = {input, result};
    for (const link of document.querySelectorAll("[data-supply-link]")) {
      const destination = new URL(link.href);
      destination.searchParams.set("supply",input.supply);
      link.href = destination.href;
    }
    syncScenarioLinks();
    const {annual, exhaustion} = result;
    const plantName = formatNumber(data.load_kw / 1000, {maximumFractionDigits:6}) + " " + text.units.mw;
    put("plant-load", plantName);
    put("net-saved", quantity(result.netSaved / 1000, "mwh", 2));
    put("saving-split", message("savings", {
      avoided:quantity(annual.snow / (data.cop * 1000), "mwh", 2),
      pumping:quantity(annual.pumping / 1000, "mwh", 2), handling:quantity(result.handlingKwh / 1000, "mwh", 2)
    }));
    put("snow-heat", thermalMwh(annual.snow));
    const share = result.summerResidual ? 100 * annual.snow / result.summerResidual : 0;
    put("snow-share", message("share", {share:format(share, 1), energy:thermalMwh(result.summerResidual)}));
    put("added-hours", quantity(annual.extraOff, "hours"));
    put("total-hours", message("off", {hours:quantity(annual.off, "hours")}));
    put("peak-duty", quantity(annual.peak, "kw"));
    let status = message("remaining", {energy:thermalMwh(result.stock)});
    if (exhaustion) {
      const month = SnowModel.months.indexOf(exhaustion.month);
      const date = language === "kk" ? exhaustion.day + " " + months[month] :
        calendar.format(new Date(Date.UTC(exhaustion.year, month, exhaustion.day)));
      status = message("depleted", {date, year:exhaustion.year, hour:format(exhaustion.hour)});
    }
    if (result.available <= 0) status = text.zero;
    if (!result.paysToPump && result.available > 0) status = text.noPump;
    put("stock-note", message("available", {energy:thermalMwh(result.available), status}));
    const target = thermalMwh(result.targetKwh);
    const withinInputRange = Math.ceil(result.requiredVolume) <= Number(form.elements.volume.max);
    if (result.targetFeasible) {
      put("target-volume", quantity(Math.ceil(result.requiredVolume), "volume"));
      const estimate = message("targetVolume", {target, tonnes:format(result.targetKwh / (1000 * SnowModel.latentKwhPerKg))});
      const limit = quantity(Number(form.elements.volume.max), "volume");
      put("target-note", withinInputRange ? estimate : estimate + " " + message("overLimit", {limit}));
    } else {
      put("target-volume", text.unreachable);
      put("target-note", input.density * input.retained === 0
        ? text.noDensity : message("maxDelivery", {limit:thermalMwh(result.summerEligible), target}));
    }
    get("apply-target").disabled = !result.targetFeasible || !withinInputRange;
    get("snow-download").disabled = false;
    renderMonths();
    drawStock();
  }

  function campusTable() {
    const cf = get("campus-form");
    const configs = [["container",55], ["panels",60], ["pile",50]];
    const valid = cf.checkValidity();
    for (const [id, volume] of configs) {
      if (!valid) { put("ret-" + id, "—"); continue; }
      const result = SnowModel.campusStock(volume, Number(get("campus-density").value),
        Number(cf.elements[id].value), 91 * 24);
      put("ret-" + id, message("campusMass", {mass:format(result.iceTonnes, 1), energy:quantity(result.retained, "kwh")}));
    }
    put("campus-note", valid ? text.campusValid : text.campusInvalid);
  }

  function renderReplay() {
    const condition = get("contact").value;
    const h = Number(get("replay-hour").value);
    const samples = data.replay;
    const stock = samples.map(p => p[condition + "_ice_kwh"]);
    const duty = samples.slice(1).map(p => p[condition + "_snow_kw"]);
    const backup = samples.slice(1).map(p => p[condition + "_backup_kw"]);
    const sum = values => values.reduce((a, b) => a + b, 0);
    put("replay-snow", quantity(sum(duty), "kwh", 1));
    put("replay-backup", quantity(sum(backup), "kwh", 1));
    put("replay-end", quantity(stock[168], "kwh", 1));
    put("replay-hour-value", h);
    put("replay-readout", message("replayReadout", {hour:format(h), ice:quantity(stock[h], "kwh", 1),
      snow:quantity(duty[h - 1], "kw", 2), backup:quantity(backup[h - 1], "kw", 2)}));
    const conditionLabel = get("contact").selectedOptions[0].textContent;
    lineChart(get("ice-chart"), stock, message("iceChart", {condition:conditionLabel}),
      [0,84,168].map(hour => [hour, quantity(hour, "hours")]), {max:1200, cursor:h, fill:true});
    lineChart(get("duty-chart"), duty, message("dutyChart", {condition:conditionLabel}),
      [1,84,168].map(hour => [hour-1, quantity(hour, "hours")]), {max:5, cursor:h - 1, stroke:"#9a611c"});
  }

  function downloadResults() {
    if (!current) return;
    const {input, result} = current;
    const settings = Object.keys(input);
    function csvRow(values) {
      return values.map(value => {
        if (typeof value === "number") return Number(value.toFixed(6));
        const content = String(value);
        return /[",\r\n]/.test(content) ? '"' + content.replace(/"/g, '""') + '"' : content;
      }).join(",");
    }
    const settingsKeys = settings.concat(["plant_load_kw", "chiller_cop"]);
    const lines = [csvRow(text.csvBase.concat(settingsKeys.map(key => text.csvSettings[key])))];
    const policyLabel = language === "en" ? input.policy : get("snow-policy").selectedOptions[0].textContent;
    for (const p of [...result.periods, result.annual]) {
      const isYear = p === result.annual;
      const values = [periodName(p.name),p.baseline/1000,p.hybrid/1000,p.withSnow/1000,
        p.hours*data.load_kw/data.cop/1000,p.residual/data.cop/1000,p.remainingDuty/data.cop/1000,
        p.snow/1000,p.pumping/1000,p.extraOff,p.off,p.peak,p.eligible/1000,
        p.stock === null ? "" : p.stock/1000,isYear ? result.handlingKwh/1000 : "",
        isYear ? result.netSaved/1000 : "",...settings.map(k => k === "policy" ? policyLabel : input[k]),data.load_kw,data.cop];
      lines.push(csvRow(values));
    }
    const prefix = language === "en" ? "" : "\uFEFF";
    const url = URL.createObjectURL(new Blob([prefix, lines.join("\r\n")+"\r\n"], {type:"text/csv;charset=utf-8"}));
    const link = document.createElement("a");
    const suffix = language === "en" ? "" : "-" + language;
    link.href = url; link.download = "astana-snow-" + input.supply + "C-" + input.policy + suffix + ".csv";
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  const initial = SnowModel.defaultCase(data);
  const defaults = {...initial};
  const campusForm = get("campus-form");
  const viewControls = {
    "monthly-meter":get("monthly-meter"), "store-density":get("campus-density"),
    "container-heat-gain":campusForm.elements.container, "panel-heat-gain":campusForm.elements.panels,
    "pile-heat-gain":campusForm.elements.pile, contact:get("contact"), "replay-hour":get("replay-hour")
  };
  const viewDefaults = {};
  const params = new URLSearchParams(location.search);
  // Older shared cases used different names for the same four inputs.
  const legacyStoreKeys = {
    "campus-density":"store-density", "campus-container":"container-heat-gain",
    "campus-panels":"panel-heat-gain", "campus-pile":"pile-heat-gain"
  };
  for (const [oldKey, key] of Object.entries(legacyStoreKeys)) {
    if (params.has(oldKey) && !params.has(key)) params.set(key, params.get(oldKey));
  }
  for (const [key, control] of Object.entries(viewControls)) {
    viewDefaults[key] = control.value;
    const raw = params.get(key);
    if (!raw || !raw.trim()) continue;
    if (control.tagName === "SELECT") {
      if (Array.from(control.options).some(option => option.value === raw)) control.value = raw;
      continue;
    }
    const n = Number(raw);
    if (Number.isFinite(n) && n >= Number(control.min) && n <= Number(control.max) &&
        (control.type !== "range" || Number.isInteger(n))) control.value = String(n);
  }
  function syncScenarioLinks() {
    const address = new URL(location.href);
    for (const oldKey of Object.keys(legacyStoreKeys)) address.searchParams.delete(oldKey);
    if (address.hash === "#campus") address.hash = "storage-designs";
    if (current) {
      for (const [key, value] of Object.entries(current.input)) {
        if (key === "supply" || value !== defaults[key]) address.searchParams.set(key, value);
        else address.searchParams.delete(key);
      }
    }
    for (const [key, control] of Object.entries(viewControls)) {
      if (!control.validity.valid) continue;
      if (control.value !== viewDefaults[key]) address.searchParams.set(key, control.value);
      else address.searchParams.delete(key);
    }
    if (/^https?:$/.test(location.protocol) && address.href !== location.href) history.replaceState(null, "", address);
    for (const link of document.querySelectorAll(".language-menu a[hreflang]")) {
      const destination = new URL(link.href);
      destination.search = address.search;
      destination.hash = address.hash;
      link.href = destination.href;
    }
  }
  for (const key of Object.keys(initial)) {
    const raw = params.get(key);
    if (!raw || !raw.trim()) continue;
    const control = form.elements.namedItem(key);
    const numeric = Number(raw);
    if (key === "policy") {
      if (["as-needed","hot-hours"].includes(raw)) initial.policy=raw;
    } else if (key === "supply") {
      if (Object.hasOwn(data.supply_tables,numeric)) initial.supply=numeric;
    } else if (Number.isFinite(numeric) && numeric>=Number(control.min) && numeric<=Number(control.max)) {
      initial[key]=numeric;
    }
  }
  function setCase(inputs) {
    for (const [key, value] of Object.entries(inputs)) form.elements.namedItem(key).value = value;
    renderFacility();
  }
  form.addEventListener("submit", e => e.preventDefault());
  form.addEventListener("input", renderFacility);
  get("size-target").addEventListener("input", renderFacility);
  get("reset-snow").addEventListener("click", () => setCase(SnowModel.defaultCase(data)));
  get("apply-target").addEventListener("click", () => {
    if (current && current.result.targetFeasible) {
      form.elements.volume.value = Math.ceil(current.result.requiredVolume);
      renderFacility();
    }
  });
  get("snow-download").addEventListener("click", downloadResults);
  get("monthly-meter").addEventListener("change", renderMonths);
  get("campus-form").addEventListener("submit", e => e.preventDefault());
  get("campus-form").addEventListener("input", campusTable);
  get("campus-density").addEventListener("input", campusTable);
  get("contact").addEventListener("change", renderReplay);
  get("replay-hour").addEventListener("input", renderReplay);
  for (const control of Object.values(viewControls)) {
    control.addEventListener(control.tagName === "SELECT" ? "change" : "input", syncScenarioLinks);
  }
  CaseShare.register(button => {
    if (!current || !form.checkValidity() || !campusForm.checkValidity()) return null;
    const params = new URLSearchParams(current.input);
    for (const [key, control] of Object.entries(viewControls)) params.set(key, control.value);
    const section = button.dataset.caseSection;
    let fields, readout;
    if (section === "replay") {
      fields = [get("contact"), get("replay-hour")];
      readout = get("replay-readout").textContent;
    } else if (section === "storage-designs") {
      fields = [get("campus-density")];
      const stores = ["container","panels","pile"].map(key => {
        const control = campusForm.elements[key], name = control.closest("article").querySelector("h4").textContent;
        return name + " · " + CaseShare.describeFields([control])[0] + " · " + get("ret-" + key).textContent;
      });
      readout = stores.join("\n");
    } else {
      fields = Object.keys(current.input).map(key => form.elements.namedItem(key));
      readout = get("total-hours").textContent;
    }
    return {params, details:[window.SiteI18n.cityName("astana","Astana"), ...CaseShare.describeFields(fields), readout]};
  });
  setCase(initial);
  campusTable();
  renderReplay();
  if (window.ResizeObserver) {
    let lastWidth;
    new ResizeObserver(entries => {
      const width = entries[0].contentRect.width;
      if (width !== lastWidth) { lastWidth = width; drawStock(); renderReplay(); }
    }).observe(get("facility"));
  }
})();
