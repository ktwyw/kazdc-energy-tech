"use strict";

(() => {
  const data = JSON.parse(document.getElementById("lab-data").textContent);
  const get = id => document.getElementById(id);
  const number = id => get(id).valueAsNumber;
  const language = document.documentElement.lang;
  const {locale, formatNumber} = window.SiteI18n;
  const fmt = (n, digits = 0) => formatNumber(n, {minimumFractionDigits: digits, maximumFractionDigits: digits});
  const localNumber = n => formatNumber(n, {maximumFractionDigits: 5, useGrouping: false});
  const regionalText = get("regional-text") && JSON.parse(get("regional-text").textContent);
  const energyText = get("energy-text") && JSON.parse(get("energy-text").textContent);
  const cityName = station => window.SiteI18n.cityName(station.slug, station.name);
  const months = regionalText?.months || EnergyLab.months;
  function message(key, values) {
    return regionalText[key].replace(/\{(\w+)\}/g, (_, name) => values[name]);
  }
  function energyMessage(key, values) {
    return energyText[key].replace(/\{(\w+)\}/g, (_, name) => values[name]);
  }
  const printable = n => Number(n.toFixed(6));
  const query = new URLSearchParams(location.search);

  const {make, drawTable, download} = LabView;

  function bars(id, rows) {
    const max = Math.max(...rows.map(r => r.value), 1);
    get(id).replaceChildren(...rows.map(r => {
      const row = make("div", undefined, r.active ? "bar-row active":"bar-row");
      const track = make("span", undefined, "bar-track"), bar = make("i");
      track.setAttribute("aria-hidden", "true");
      bar.style.width = (100 * r.value / max) + "%";
      track.append(bar);
      row.append(make("span", r.name), track, make("strong", fmt(r.value, 1)));
      return row;
    }));
  }

  function fillCities(select) {
    const sorted = [...data.stations].sort((a, b) => cityName(a).localeCompare(cityName(b), locale));
    select.replaceChildren(...sorted.map(station => {
      const opt = make("option", cityName(station));
      opt.value = station.slug;
      return opt;
    }));
  }

  function stations() {
    const select = get("city");
    fillCities(select);
    const chosen = data.stations.find(station => station.slug === query.get("city"));
    select.value = chosen ? chosen.slug : "astana";
    return () => data.stations.find(station => station.slug === select.value);
  }

  function setLink(id, param, value) {
    const a = get(id);
    const url = new URL(a.href);
    url.searchParams.set(param, value);
    a.href = url.href;
  }

  function syncLabLinks(city, supply) {
    for (const navLink of document.querySelectorAll('[data-study-link]')) {
      const url = new URL(navLink.href);
      const target = navLink.dataset.studyLink;
      if (["regional", "heat", "tech"].includes(target)) {
        url.searchParams.set("city", city);
        navLink.href = url.href;
      }
      if (supply !== undefined && ["tech","snow","regional","heat"].includes(target)) {
        url.searchParams.set("supply",supply);
        navLink.href=url.href;
      }
    }
  }

  function bindForm(id, render, reset) {
    const form = get(id);
    form.addEventListener("input", render);
    form.addEventListener("change", render);
    form.addEventListener("submit", event => event.preventDefault());
    if (reset) get("reset").addEventListener("click", () => { form.reset(); reset(); render(); });
  }

  function invalidate(prefix, form, values, outputs, tables, chartId) {
    const bad = !get(form).checkValidity();
    get(prefix + "-error").hidden = !bad;
    if (!bad) return false;
    const field = get(form).querySelector(":invalid");
    get(prefix + "-error").textContent = field?.validity.customError
      ? field.validationMessage : energyText.invalid;
    outputs.forEach(id => { get(id).textContent = ""; });
    values.forEach(id => { get(id).textContent = "—"; });
    tables.forEach(id => get(id).replaceChildren());
    if (chartId) get(chartId).replaceChildren();
    return true;
  }

  function restoreModelFields(ids) {
    for (const id of ids) {
      const raw = query.get(id);
      if (!raw || !raw.trim()) continue;
      const field = get(id);
      if (field.tagName === "SELECT") {
        if (Array.from(field.options).some(option=>option.value===raw)) field.value=raw;
      } else {
        const initial = field.value;
        field.value = raw;
        if (!field.validity.valid) field.value=initial;
      }
    }
  }

  function saveModelFields(ids, extra = {}) {
    const address = new URL(location.href);
    for (const id of ids) {
      const field = get(id);
      const initial = field.tagName === "SELECT" ? field.options[0].value : field.defaultValue;
      if (!field.disabled && field.value !== initial) address.searchParams.set(id,field.value);
      else address.searchParams.delete(id);
    }
    for (const [key,value] of Object.entries(extra)) {
      if (value) address.searchParams.set(key,value);
      else address.searchParams.delete(key);
    }
    if (/^https?:$/.test(location.protocol) && address.href !== location.href) {
      history.replaceState(null, "", address);
    }
    for (const link of document.querySelectorAll(".language-menu a[hreflang]")) {
      const destination = new URL(link.href);
      destination.search = address.search;
      destination.hash = address.hash;
      link.href = destination.href;
    }
  }

  function fieldCase(ids, extra, details) {
    const fields = ids.map(get).filter(field => !field.disabled);
    const params = new URLSearchParams(extra);
    for (const field of fields) params.set(field.id, field.value);
    return {params, details:[...CaseShare.describeFields(fields), ...details]};
  }

  function regional() {
    const station = stations();
    const supplied = Number(query.get("supply"));
    if (Object.hasOwn(data.cooling, supplied)) get("supply").value = supplied;
    get("almaty-details").addEventListener("click", () => { get("regional-method").open = true; });
    if (location.hash === "#almaty-source") get("regional-method").open = true;
    let peer = data.stations.find(s => s.slug === query.get("peer"))?.slug || "shymkent";
    const results = new Map();
    let result, ranked, lastSupply, lastCity;
    const pairLabels = regionalText.pairLabels;
    const firstSelect = get("pair-first"), secondSelect = get("pair-second"), pairSupply = get("pair-supply");
    fillCities(firstSelect);
    fillCities(secondSelect);
    for (const t of Object.keys(data.cooling).map(Number).sort((a, b) => a - b)) {
      const option = make("option", localNumber(t) + " °C");
      option.value = t;
      pairSupply.append(option);
    }
    const metricControls = [...document.querySelectorAll('input[name="pair-metric"]')];
    if (query.get("metric") === "off") metricControls[1].checked = true;
    const pairMetric = () => metricControls[1].checked ? "off" : "hybrid";
    const peerStation = () => data.stations.find(s => s.slug === peer);
    function comparisonParams() {
      const params = new URLSearchParams({city:station().slug, supply:number("supply"), peer});
      if (pairMetric() === "off") params.set("metric","off");
      return params;
    }
    function drawPair() {
      const metric = pairMetric(), label = metric === "off" ? pairLabels.pairOff : pairLabels.pairPower;
      const unit = metric === "off" ? pairLabels.pairHoursUnit : pairLabels.pairEnergyUnit;
      const cities = [station(), peerStation()];
      get("pair-unit").textContent = label + " (" + unit + ")";
      MonthlyChart.draw("pair-chart", cities.map((city, i) => ({
        name:cityName(city), values:results.get(city).rows.map(row => row[metric]),
        color:i ? "#98571f" : "#087563", weight:2.6, mark:i === 0, dash:i ? "6 4" : ""
      })), window.SiteI18n.shortMonths, [label, unit, ...cities.map(cityName)].join(" · "));
      const [left,right] = cities.map(city => results.get(city).rows);
      const differences = left.map((row,i) => row[metric] - right[i][metric]);
      const largest = Math.max(...differences.map(Math.abs));
      const month = differences.findIndex(d => Math.abs(d) === largest);
      const higher = differences[month] > 0 ? 0 : 1;
      get("pair-difference").textContent = largest < 1e-7 ? message("pairEqual", {metric:label})
        : message(metric === "off" ? "pairHoursDifference" : "pairEnergyDifference", {
          month:window.SiteI18n.months[month], city:cityName(cities[higher]), other:cityName(cities[1-higher]),
          gap:fmt(largest, metric === "off" ? 0 : 2)
        });
    }
    function pairRows() {
      const left = result, right = results.get(peerStation());
      const rows = left.rows.map((a, i) => [window.SiteI18n.months[i], a, right.rows[i]]);
      return [...rows, [pairLabels.pairAnnual, left.year, right.year]];
    }
    function renderPair(city) {
      firstSelect.value = city.slug;
      secondSelect.value = peer;
      for (const option of secondSelect.options) option.disabled = option.value === city.slug;
      pairSupply.value = number("supply");
      const second = peerStation();
      for (const [suffix, name] of [["first",cityName(city)], ["second",cityName(second)]]) {
        get("pair-name-" + suffix).textContent = get("pair-heading-" + suffix).textContent = name;
      }
      get("pair-caution").hidden = !city.quality_note && !second.quality_note;
      get("pair-caution").textContent = regionalText.pairCaution;
      drawPair();
      const rows = pairRows().map(([period, a, b]) => {
        const tr = make("tr"), heading = make("th", period);
        heading.scope = "row";
        tr.append(heading);
        for (const r of [a,b]) tr.append(make("td", fmt(r.hybrid,2)), make("td", fmt(r.off)));
        return tr;
      });
      const table = get("pair-table");
      table.tFoot.replaceChildren(rows.pop());
      table.tBodies[0].replaceChildren(...rows);
    }
    function studyLink(id, fields) {
      const link = get(id), target = new URL(link.href);
      target.search = new URLSearchParams(fields);
      link.href = target.href;
    }
    const snowData = JSON.parse(get("snow-reference").textContent);
    const snowCase = SnowModel.defaultCase(snowData);
    const snow = SnowModel.simulate(snowData, snowCase);
    get("snow-result").textContent = fmt(snow.annual.extraOff);
    get("snow-result-context").textContent = message("snowContext", {
      supply:localNumber(snowCase.supply), volume:fmt(snowCase.volume)
    });
    studyLink("snow-result-link", snowCase);
    const referenceEfficiency = 94, alternativeEfficiency = 97;
    const ups = EnergyLab.ups(data.it_kw, referenceEfficiency, alternativeEfficiency);
    get("ups-result").textContent = fmt(ups.saved, 1);
    get("ups-result-context").textContent = message("upsContext", {
      load:localNumber(data.it_kw / 1000), before:referenceEfficiency, after:alternativeEfficiency
    });
    studyLink("ups-result-link", {load:data.it_kw, "reference-eff":referenceEfficiency, "alternative-eff":alternativeEfficiency});
    function showHeatResult(city) {
      const heatCase = {mode:"direct", warmReturn:40, target:35, peak:750, capture:70};
      const heat = EnergyLab.recovery(data, city, heatCase);
      get("heat-result").textContent = fmt(heat.year.delivered, 1);
      get("heat-result-context").textContent = message("heatContext", {
        city:cityName(city), returnTemp:heatCase.warmReturn, target:heatCase.target, peak:fmt(heatCase.peak)
      });
      studyLink("heat-result-link", {city:city.slug, mode:heatCase.mode, warm:heatCase.warmReturn,
        target:heatCase.target, peak:heatCase.peak, capture:heatCase.capture});
      get("study-results-title").parentElement.hidden = false;
    }
    function saveComparison() {
      const address = new URL(location.href);
      for (const [key,value] of comparisonParams()) address.searchParams.set(key,value);
      if (pairMetric() !== "off") address.searchParams.delete("metric");
      const links = document.querySelectorAll('[data-language-case], [data-weather-link], [data-study-link="regional"], [data-study-link="references"], .foot a[data-reference-link]');
      for (const link of links) {
        const target = new URL(link.href);
        target.search = address.search;
        if (link.hasAttribute("data-language-case")) target.hash = address.hash;
        link.href = target.href;
      }
      if (/^https?:$/.test(location.protocol) && address.href !== location.href) history.replaceState(null, "", address);
    }
    function render() {
      const city = station(), supply = number("supply");
      if (supply !== lastSupply) {
        for (const s of data.stations) results.set(s, EnergyLab.cooling(data, s, supply));
        ranked = [...data.stations].sort((a, b) => results.get(a).year.hybrid - results.get(b).year.hybrid);
        lastSupply = supply;
      }
      result = results.get(city);
      if (city.slug !== lastCity) {
        showHeatResult(city);
        if (peer === city.slug) peer = lastCity || (city.slug === "astana" ? "shymkent" : "astana");
        lastCity = city.slug;
      }
      const year = result.year, base = year.baseline;
      get("weather-origin").textContent = window.SiteI18n.stationNote(city);
      get("supply-value").textContent = localNumber(supply) + " °C";
      const share = year.hybrid / base;
      get("selected-cooling").textContent = message("selectedCooling", {
        city:cityName(city), energy:fmt(year.hybrid, 1), off:fmt(year.off)
      });
      get("case-context").textContent = message("caseContext", {
        city:cityName(city), it:localNumber(data.it_kw / 1000), supply:localNumber(supply)
      });
      get("case-saving").textContent = fmt(100 * (1 - share), 1) + "%";
      get("case-baseline").textContent = fmt(base, 1);
      get("case-hybrid").textContent = fmt(year.hybrid, 1);
      get("case-hybrid-bar").style.width = (100 * share) + "%";
      get("case-off").textContent = message("caseOff", {off:fmt(year.off), hours:fmt(year.hours)});
      const july = result.rows[6];
      get("case-july").textContent = message("caseJuly", {off:fmt(july.off), hours:fmt(july.hours)});
      const tried = supply === 24;
      get("case-july").hidden = tried;
      get("experiment").hidden = false;
      get("experiment-prompt").hidden = tried;
      get("experiment-result").hidden = !tried;
      get("experiment-result").textContent = tried ? message("experimentResult", {
        city:cityName(city), hours:fmt(july.hours), before:fmt(EnergyLab.cooling(data, city, 18).rows[6].off),
        after:fmt(july.off)
      }) : "";
      get("try-supply").textContent = tried ? pairLabels.back18 : pairLabels.try24;
      get("threshold").textContent = message("threshold", {temperature:localNumber(supply - data.plant.rated_approach_k)});
      get("baseline-note").textContent = message("baseline", {energy:fmt(base, 1)});
      get("station-detail").textContent = message("detail", {
        location:city.epw_location, source:city.epw_source, id:city.station_id, lat:localNumber(city.lat),
        lon:localNumber(city.lon), height:localNumber(city.elevation_m), offset:"+" + localNumber(city.utc_offset),
        catalogue:city.catalogue_period, years:city.source_years, period:city.period
      });
      get("station-source").href = city.source_url;
      bars("city-bars", ranked.map(s => ({name:cityName(s), value:results.get(s).year.hybrid, active:s===city})));
      drawTable("regional-table", regionalText.columns,
        result.rows.map((r, i)=>[months[i],fmt(r.mean,1),fmt(r.baseline,2),fmt(r.hybrid,2),fmt(r.off)]),
        [regionalText.annual,fmt(result.rows.reduce((sum,r)=>sum+r.mean*r.hours,0)/year.hours,1),fmt(base,2),fmt(year.hybrid,2),fmt(year.off)]);
      setLink("astana-link","supply",supply);
      setLink("snow-link","supply",supply);
      setLink("heat-link","city",city.slug);
      setLink("heat-link","supply",supply);
      syncLabLinks(city.slug,supply);
      renderPair(city);
      saveComparison();
    }
    bindForm("regional-form", render, () => { get("city").value="astana"; peer="shymkent"; metricControls[0].checked=true; });
    get("try-supply").addEventListener("click", () => { get("supply").value = number("supply") === 24 ? 18 : 24; render(); });
    get("pair-form").addEventListener("submit", event => event.preventDefault());
    firstSelect.addEventListener("change", () => { get("city").value = firstSelect.value; render(); });
    secondSelect.addEventListener("change", () => { peer = secondSelect.value; render(); });
    pairSupply.addEventListener("change", () => { get("supply").value = pairSupply.value; render(); });
    metricControls.forEach(control => control.addEventListener("change", () => { drawPair(); saveComparison(); }));
    get("example-pair").addEventListener("click", () => {
      get("city").value = "ekibastuz"; peer = "oskemen"; render();
    });
    window.addEventListener("resize", drawPair);
    CaseShare.register(button => {
      if (!result) return null;
      const details = [get("case-context").textContent, get("selected-cooling").textContent,
        document.querySelector(".energy-comparison dt").textContent + " · " + fmt(result.year.baseline,1) + " " + pairLabels.pairEnergyUnit,
        [...get("cooling-result-title").children].map(el => el.textContent).join(" "), get("case-july").textContent];
      if (button.dataset.caseSection === "city-comparison") {
        const second = peerStation(), year = results.get(second).year;
        details.push(message("selectedCooling", {city:cityName(second), energy:fmt(year.hybrid,1), off:fmt(year.off)}),
          message("caseJuly", {off:fmt(results.get(second).rows[6].off), hours:fmt(results.get(second).rows[6].hours)}));
      }
      return {params:comparisonParams(), details};
    });
    function csvHeaders(keys) {
      return keys.map(key => regionalText.csvFields?.[key] || key);
    }
    const stationWarning = city => city.quality_note ? regionalText.quality : "";
    get("download-pair").addEventListener("click", () => {
      const cities = [station(), peerStation()];
      const headings = cities.flatMap(city => [
        cityName(city) + " · " + pairLabels.pairPower + " (" + pairLabels.pairEnergyUnit + ")",
        cityName(city) + " · " + pairLabels.pairOff + " (" + pairLabels.pairHoursUnit + ")"
      ]);
      download(cities.map(city => city.slug).join("-") + "-" + number("supply") + "C.csv", [
        [pairLabels.pairMonth, ...headings, pairLabels.pairSupply + " (°C)",
          ...cities.map(city => cityName(city) + " · " + csvHeaders(["weather_archive"])[0])],
        ...pairRows().map(([period,a,b]) => [period, printable(a.hybrid), a.off, printable(b.hybrid), b.off,
          number("supply"), ...cities.map(city => city.source_url)])
      ]);
    });
    get("download-cities").addEventListener("click", () => {
      const supply = number("supply");
      const rows = ranked.map(city => {
        const y = results.get(city).year;
        return [cityName(city),city.station_id,city.period,city.source_years,city.catalogue_period,supply,y.hours,
          printable(y.baseline),printable(y.hybrid),y.off,city.epw_location,city.epw_source,city.source_url,stationWarning(city)];
      });
      download("kazakhstan-cooling-"+supply+"C.csv", [
        csvHeaders(["station","epw_station_id","source_period","source_years","catalogue_period","supply_c","hours","chiller_only_mwh_e","dry_chiller_mwh_e","chiller_off_h","epw_location","epw_source","weather_archive","station_note"]),
        ...rows
      ]);
    });
    get("download-months").addEventListener("click", () => {
      const city = station(), supply = number("supply");
      const rows = result.rows.concat([{...result.year, month:"Annual",mean:result.rows.reduce((s,r)=>s+r.mean*r.hours,0)/result.year.hours}]);
      download(city.slug+"-cooling-"+supply+"C.csv", [
        csvHeaders(["station","epw_station_id","tmyx_period","supply_c","month","hours","mean_air_c","chiller_only_mwh_e","dry_chiller_mwh_e","chiller_off_h","epw_location","epw_source","source_years","catalogue_period","weather_archive","station_note"]),
        ...rows.map((r,i)=>[cityName(city),city.station_id,city.period,supply,months[i] || regionalText.annual,r.hours,printable(r.mean),printable(r.baseline),printable(r.hybrid),r.off,city.epw_location,city.epw_source,city.source_years,city.catalogue_period,city.source_url,stationWarning(city)])]);
    });
    render();
  }

  function heat() {
    const station = stations();
    const monthNames = window.SiteI18n.months;
    const chartMonths = window.SiteI18n.shortMonths;
    const heatFields = ["mode","warm","target","capture","peak","cop"];
    restoreModelFields(heatFields);
    get("capture-context").hidden = query.get("from") !== "cold-plate" || !query.has("capture");
    get("capture").addEventListener("input", () => { get("capture-context").hidden = true; });
    let result, inputs;
    CaseShare.register(() => {
      if (!result || !get("heat-form").checkValidity()) return null;
      const extra = {city:station().slug};
      if (!get("capture-context").hidden) extra.from = "cold-plate";
      const linked = Number(query.get("supply"));
      if (linked >= 8 && linked <= 32 && Number.isInteger(linked * 2)) extra.supply = linked;
      return fieldCase(heatFields, extra, [cityName(station()), ...CaseShare.resultLines(), get("heat-status").textContent]);
    });
    function draw() {
      if (!result) return;
      MonthlyChart.draw("heat-chart", [
        {name:energyText.chartDemand,values:result.rows.map(r=>r.demand),color:"#82968a",weight:3,dash:"5 4"},
        {name:energyText.chartDelivered,values:result.rows.map(r=>r.delivered),color:"#087b69",weight:2,mark:true}
      ], chartMonths, energyText.chartDescription);
    }
    function render() {
      const city = station();
      get("weather-origin").textContent = window.SiteI18n.stationNote(city);
      const linkedSupply = Number(query.get("supply"));
      const supply = linkedSupply>=8 && linkedSupply<=32 && Number.isInteger(linkedSupply*2) ? linkedSupply : undefined;
      syncLabLinks(city.slug,supply);
      const mode = get("mode").value;
      const direct = number("warm") >= number("target")+3;
      get("cop").disabled = mode === "direct" || direct || number("capture") === 0 || number("peak") === 0;
      const limit = EnergyLab.heatingCopLimit(number("warm"), number("target"));
      const cop = get("cop");
      cop.setCustomValidity(!cop.disabled && number("cop") >= limit
        ? energyMessage("copLimit", {limit:fmt(limit, 2)}) : "");
      const invalid = invalidate("heat","heat-form",["delivered","coverage","compressor"],["heat-status"],["heat-table"],"heat-chart");
      get("download-heat").disabled = invalid;
      if (invalid) { result = null; return; }
      inputs = {mode,capture:number("capture"),warmReturn:number("warm"),target:number("target"),peak:number("peak"),
        cop:get("cop").disabled ? null : number("cop")};
      result = EnergyLab.recovery(data, city, inputs);
      saveModelFields(heatFields,{city:city.slug,from:get("capture-context").hidden ? null : "cold-plate",
        capture:get("capture-context").hidden && get("capture").value===get("capture").defaultValue ? null : get("capture").value});
      const y = result.year;
      get("heat-title").textContent = energyMessage("heatTitle", {city:cityName(city)});
      get("delivered").textContent = fmt(y.delivered,1);
      get("coverage").textContent = y.demand ? fmt(100*y.delivered/y.demand,1)+"%" : "—";
      get("compressor").textContent = fmt(y.compressor,1);
      const route = inputs.peak === 0 ? "zeroDemand" : inputs.capture === 0 ? "zeroCapture" :
        direct ? "direct" : mode === "direct" ? "tooCool" : "lift";
      get("heat-status").textContent = energyMessage("heatSummary", {route:energyText[route], demand:fmt(y.demand,1), unmet:fmt(y.unmet,1)});
      const cells = (r, label) => [label,fmt(r.demand,2),fmt(r.source,2),fmt(r.compressor,2),fmt(r.delivered,2),fmt(r.unmet,2)];
      drawTable("heat-table", energyText.heatTable, result.rows.map((r,i) => cells(r, monthNames[i])), cells(y, energyText.annual));
      draw();
    }
    bindForm("heat-form",render,()=>{get("city").value="astana"; get("capture-context").hidden=true;});
    get("download-heat").addEventListener("click",()=>{
      const s=station();
      const rows = [...result.rows, result.year];
      const mode = inputs.mode === "direct" ? energyText.csvDirect : energyText.csvLift;
      const stationNote = s.quality_note ? (language === "en" ? s.quality_note : window.SiteI18n.stationNote(s)) : "";
      download(s.slug+"-heat-reuse.csv",[
        energyText.heatCsv,
        ...rows.map((r,i)=>[cityName(s),s.station_id,s.period,mode,inputs.capture,inputs.warmReturn,inputs.target,inputs.peak,inputs.cop??"",
          i === 12 ? energyText.annual : language === "en" ? r.month : monthNames[i],
          ...["demand","source","compressor","delivered","unmet"].map(k=>printable(r[k])),
          s.epw_location,s.epw_source,s.source_years,s.catalogue_period,s.source_url,stationNote])]);
    });
    render();
    window.addEventListener("resize",draw);
  }

  function power() {
    const fields=["load","reference-eff","alternative-eff"];
    restoreModelFields(fields);
    let result;
    CaseShare.register(() => result && get("power-form").checkValidity()
      ? fieldCase(fields, {}, [...CaseShare.resultLines(), get("power-note").textContent]) : null);
    function render() {
      const invalid = invalidate("power","power-form",["power-before","power-after","power-saving"],["power-note"],[],"power-bars");
      get("download-power").disabled=invalid;
      if(invalid) return;
      saveModelFields(fields);
      result=EnergyLab.ups(number("load"),number("reference-eff"),number("alternative-eff"));
      get("power-before").textContent=fmt(result.beforeMwh,1);
      get("power-after").textContent=fmt(result.afterMwh,1);
      get("power-saving").textContent=fmt(result.saved,1);
      bars("power-bars",[{name:energyText.reference,value:result.before,active:false},{name:energyText.alternative,value:result.after,active:true}]);
      get("power-note").textContent = energyMessage("powerSummary", {load:fmt(number("load"),1), before:fmt(result.before,1), after:fmt(result.after,1)});
    }
    bindForm("power-form",render,()=>{});
    get("download-power").addEventListener("click",()=>download("ups-comparison.csv",[
      energyText.powerCsv,
      ...[[energyText.reference,"reference-eff",result.before,result.beforeMwh,0],[energyText.alternative,"alternative-eff",result.after,result.afterMwh,result.saved]]
      .map(([name,id,loss,mwh,saved])=>[name,number("load"),number(id),printable(number("load")+loss),printable(loss),8760,printable(mwh),printable(saved)])]));
    render();
  }

  function bench() {
    let measured=false, result;
    const form=get("bench-form");
    // Readings stay in this tab. Transfer them once, only when following a language link.
    const transferKey = "kazdc-bench-language-v1";
    const fields = [...form.querySelectorAll("input")];
    const numericIds = fields.filter(field => field.type === "number").map(field => field.id);
    if (query.get("example") === "1") restoreModelFields(numericIds);
    const draft = LabView.takeLanguageDraft(transferKey);
    if (draft && typeof draft.measured === "boolean" && draft.values) {
      measured = draft.measured;
      for (const field of fields) {
        if (typeof draft.values[field.id] === "string") field.value = draft.values[field.id];
      }
    }
    LabView.onLanguageChange(transferKey, () => {
      const values = {};
      for (const field of fields) {
        if (!measured && field.id === "run-name" && field.value === field.defaultValue) continue;
        values[field.id] = field.value;
      }
      return {measured, values};
    });
    CaseShare.register(() => !measured && result && form.checkValidity()
      ? fieldCase(numericIds, {example:1}, [get("evidence").textContent, get("bench-note").textContent]) : null);
    function render() {
      document.querySelector(".case-share").classList.toggle("private-readings", measured);
      get("evidence").textContent=measured?energyText.measuredEvidence:energyText.exampleEvidence;
      get("run-kind").textContent=measured?energyText.measuredHeading:energyText.exampleHeading;
      get("run-name").setCustomValidity(get("run-name").value.trim() ? "" : energyText.runRequired);
      const invalid=invalidate("bench","bench-form",["duty","absorbed","gap"],["bench-note"],["bench-table"]);
      get("download-run").disabled=invalid;
      if(invalid) return;
      result=EnergyLab.waterRun(number("flow"),number("tin"),number("tout"),number("duration"),number("meter"));
      get("duty").textContent=fmt(result.duty,3);
      get("absorbed").textContent=fmt(result.absorbed,3);
      get("gap").textContent=fmt(result.gap,3);
      const difference=result.duty-number("predicted");
      get("bench-note").textContent = energyMessage("benchSummary", {duty:fmt(result.duty,3), predicted:fmt(number("predicted"),3), difference:fmt(difference,3)});
      drawTable("bench-table",energyText.benchTable,[
        [energyText.rise,energyMessage("tempDifference", {v:fmt(number("tout")-number("tin"),2)})],
        [energyText.meter,energyMessage("meterEnergy", {v:fmt(number("meter"),3)})],
        [energyText.residual,result.gapPercent===null?energyText.zeroInput:fmt(result.gapPercent,1)+"%"]]);
    }
    bindForm("bench-form",render);
    get("sample").addEventListener("click",()=>{measured=false;form.reset();render();});
    get("new-run").addEventListener("click",()=>{
      measured=true;
      for(const input of form.querySelectorAll("input")) input.value="";
      render();
      get("run-name").focus();
    });
    get("download-run").addEventListener("click",()=>{
      const label=get("run-name").value.trim();
      const safeLabel=/^[=+@\-\t\r]/.test(label) ? "'"+label : label;
      download("water-loop-run.csv",[
        energyText.benchCsv,
        [safeLabel,measured?energyText.csvMeasured:energyText.csvExample,number("predicted"),number("flow"),number("tin"),number("tout"),number("duration"),number("meter"),
          4.18,printable(result.duty),printable(result.absorbed),printable(result.gap),result.gapPercent===null?"":printable(result.gapPercent),printable(result.duty-number("predicted"))]]);
    });
    render();
  }

  const page = document.body.dataset.page;
  function openLegacySection() {
    if (page !== "regional" || !["#controls", "#charts", "#monthly", "#top"].includes(location.hash)) return false;
    const destination = new URL(get("astana-link").getAttribute("href"), location.href);
    destination.search = location.search;
    destination.hash = location.hash;
    location.replace(destination.href);
    return true;
  }
  if (!openLegacySection()) {
    ({regional,heat,power,bench})[page]();
    if (page === "regional") window.addEventListener("hashchange", openLegacySection);
  }
})();
