"use strict";

(() => {
  const {make,drawTable,download} = LabView;
  const get = id => document.getElementById(id);
  const data = JSON.parse(get("lab-data").textContent);
  const site = window.SiteI18n;
  const text = JSON.parse(get("technology-text").textContent);
  const ui = text.ui;
  const studies = technologyStudies(text, data.plant, site.locale, site.formatNumber);
  const form = get("tech-form"), citySelect = get("city");
  const url = new URL(location.href);
  const format = (value, digits = 1) => site.formatNumber(value,{minimumFractionDigits:digits,maximumFractionDigits:digits});
  const message = (key, values) => ui[key].replace(/\{(\w+)\}/g, (_, name) => values[name]);
  const numberForCsv = n => Number(n.toFixed(6));
  const months = site.shortMonths;
  const cityName = station => site.cityName(station.slug, station.name);
  const monthly = key => ["pad","air","tank","solar"].includes(key);
  const hasCity = key => key !== "cold";
  const coldStates = new Map();
  const states = new Map(), fields = new Map(), weatherCache = new Map();
  let id, latest, coldMode = "example";
  const initialSupply = Number(url.searchParams.get("supply"));
  let supply = initialSupply >= 8 && initialSupply <= 32 && Number.isInteger(initialSupply*2) ? initialSupply : 18;
  let city = data.stations.find(s => s.slug === url.searchParams.get("city")) || data.stations.find(s => s.slug === "astana");
  const orderedCities = [...data.stations].sort((a,b) => cityName(a).localeCompare(cityName(b),site.locale));
  for (const s of orderedCities) {
    const option = make("option", cityName(s));
    option.value = s.slug;
    citySelect.append(option);
  }
  citySelect.value = city.slug;

  function restoreScenario(address) {
    const key = address.searchParams.get("study");
    if (!Object.hasOwn(studies,key)) return;
    if (key === "cold") coldMode = address.searchParams.get("reading") === "measured" ? "measured" : "example";
    const values = {};
    for (const entry of studies[key].inputs) {
      if (key === "cold" && coldMode === "measured") continue;
      const raw = address.searchParams.get(entry.id);
      if (entry.id === "supply" || !raw || !raw.trim()) continue;
      const value = Number(raw);
      const valid = entry.options ? entry.options.includes(value) :
        Number.isFinite(value) && value >= entry.min && value <= entry.max &&
        Math.abs((value-entry.min)/entry.step - Math.round((value-entry.min)/entry.step)) < 1e-7;
      if (valid) values[entry.id] = String(value);
    }
    if (key === "cold") {
      if (coldMode === "example") coldStates.set(coldMode, values);
    } else states.set(key,values);
  }
  function linkFor(key, keepSection = false) {
    const u = new URL(location.href);
    u.search = "";
    u.searchParams.set("study",key);
    u.searchParams.set("city",city.slug);
    u.searchParams.set("supply",supply);
    if (key === "cold" && coldMode === "measured") u.searchParams.set("reading","measured");
    else {
      const values = (key === "cold" ? coldStates.get("example") : states.get(key)) || {};
      for (const entry of studies[key].inputs) {
        const value = values[entry.id];
        if (entry.id !== "supply" && value !== undefined && value !== "" && Number(value) !== entry.value)
          u.searchParams.set(entry.id, value);
      }
    }
    if (!keepSection) u.hash = "";
    return u.href;
  }
  function updateLinks() {
    for (const a of get("study-switch").querySelectorAll("a")) a.href = linkFor(a.dataset.study);
    for (const a of document.querySelectorAll(".mast [data-study-link]")) {
      const target = a.dataset.studyLink, u = new URL(a.href);
      if (target === "tech") { a.href=linkFor(id, true); continue; }
      if (target === "regional" || target === "heat") u.searchParams.set("city",city.slug);
      if (["regional","snow","heat"].includes(target)) u.searchParams.set("supply",supply);
      a.href=u.href;
    }
    const current = new URL(linkFor(id, true));
    for (const link of document.querySelectorAll(".language-menu a[hreflang]")) {
      const destination = new URL(link.href);
      destination.search = current.search;
      destination.hash = current.hash;
      link.href = destination.href;
    }
  }
  function setAddress(push=false) {
    if (location.protocol === "http:" || location.protocol === "https:") {
      const address = linkFor(id, !push);
      if (address !== location.href) history[push ? "pushState" : "replaceState"](null,"",address);
    }
    updateLinks();
  }
  const nav = get("study-switch");
  const heatLink = get("apply-capture"), heatURL = heatLink.href;
  for (const key of Object.keys(studies)) {
    const a=make("a",studies[key].nav);
    a.dataset.study=key;
    a.href=linkFor(key);
    a.addEventListener("click",event => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      if (key !== id) { openStudy(key); setAddress(true); }
    });
    nav.append(a);
  }

  function addInputs() {
    const config = studies[id], holder=get("study-inputs");
    holder.replaceChildren();
    fields.clear();
    if (id === "cold") {
      const label=make("label",ui.readingSource);
      label.htmlFor="reading-mode";
      const select=make("select"); select.id="reading-mode";
      for (const [key,title] of [["example",ui.example],["measured",ui.enterMeasured]]) {
        const option=make("option",title); option.value=key; select.append(option);
      }
      select.value=coldMode;
      select.addEventListener("change",() => {
        coldMode=select.value; addInputs(); render(); setAddress();
      });
      holder.append(label,select);
    }
    const saved=(id === "cold" ? coldStates.get(coldMode) : states.get(id)) || {};
    const grid=make("div",undefined,"tech-fields");
    for (const entry of config.inputs) {
      const box=make("div"), label=make("label",entry.label+" ("+entry.unit+")");
      const fieldId="in-"+entry.id;
      label.htmlFor=fieldId;
      const input=make(entry.options?"select":"input");
      input.id=fieldId; input.name=entry.id; input.required=true;
      if (entry.options) {
        for (const value of entry.options) {
          const opt=make("option",value); opt.value=String(value); input.append(opt);
        }
      } else {
        input.type="number"; input.min=entry.min; input.max=entry.max; input.step=entry.step;
      }
      let value=saved[entry.id] ?? entry.value;
      if (entry.id === "supply") value=supply;
      else if (id === "cold" && coldMode === "measured" && !(entry.id in saved)) value="";
      input.value=value;
      fields.set(entry.id,input);
      box.append(label,input); grid.append(box);
    }
    holder.append(grid);
  }

  function addMethod() {
    const target=get("study-method");
    target.replaceChildren();
    for (const [title,paragraph] of studies[id].method) {
      const div=make("div"); div.append(make("h3",title),make("p",paragraph)); target.append(div);
    }
    const list=make("p",undefined,"tech-sources");
    for (const [href,name] of studies[id].sources) {
      const link=make("a",name); link.href=href; list.append(link);
    }
    if (hasCity(id)) {
      const link=make("a",ui.weatherFile); link.id="source-weather"; link.href=city.source_url; list.append(link);
    }
    const topics = {pad:"cooling", air:"cooling", cold:"liquid", glycol:"liquid", tank:"storage", solar:"power"};
    const reference = make("a", ui.sources);
    reference.href = "{{REFERENCES_URL}}#" + topics[id];
    list.prepend(reference);
    target.append(list);
  }

  function solarTimingNote() {
    const flagged = ["aktau","atyrau","kostanay","oral","turkistan","zhezkazgan"];
    return id === "solar" && flagged.includes(city.slug)
      ? ui.solarTiming
      : "";
  }

  function stationInfo() {
    if (!hasCity(id)) return;
    citySelect.value=city.slug;
    get("weather-origin").textContent=site.stationNote(city);
    get("source-weather").href=city.source_url;
    const timing = solarTimingNote();
    if (timing) get("weather-origin").textContent += " " + timing;
  }

  function openStudy(key) {
    id=Object.hasOwn(studies,key)?key:"pad";
    const config=studies[id];
    for (const a of nav.querySelectorAll("a")) {
      if (a.dataset.study===id) a.setAttribute("aria-current","page"); else a.removeAttribute("aria-current");
    }
    get("study-domain").textContent=config.category;
    get("study-title").textContent=config.title;
    get("study-question").textContent=config.question;
    get("input-title").textContent=id==="cold"?ui.testReadings:ui.modelInputs;
    get("place-input").hidden=!hasCity(id);
    get("input-assumptions").textContent=config.assumptions;
    get("monthly-details").open=false;
    get("chart-area").hidden=!monthly(id);
    get("bench-area").hidden=monthly(id);
    addInputs(); addMethod(); render(); updateLinks();
  }

  function svg(tag,attributes,label) {
    const element=document.createElementNS("http://www.w3.org/2000/svg",tag);
    for(const [key,value] of Object.entries(attributes)) element.setAttribute(key,value);
    if(label!==undefined) element.textContent=label;
    return element;
  }
  function drawMonthlyChart(rows,chart) {
    const holder=get("tech-chart"), width=Math.max(240,Math.floor(holder.getBoundingClientRect().width));
    const height=170, left=40, right=10, bottom=144;
    const lines=chart.lines, colors=["#aebfb1","#126955"];
    const max=Math.max(1,...rows.flatMap(r=>lines.map(([key])=>r[key])));
    const magnitude=10**Math.floor(Math.log10(max));
    const high=Math.ceil(max/(magnitude/2))*(magnitude/2);
    const chartSvg=svg("svg",{viewBox:"0 0 "+width+" "+height,role:"img","aria-label":message("chartDescription",chart)});
    const y=n=>bottom-(bottom-12)*n/high;
    for (const n of [0,high/2,high]) {
      chartSvg.append(svg("line",{x1:left,x2:width-right,y1:y(n),y2:y(n),stroke:"#c4d2c6","stroke-width":.8}));
      chartSvg.append(svg("text",{x:left-5,y:y(n)+4,fill:"#496157","text-anchor":"end","font-size":10},format(n,n>=10?0:1)));
    }
    const step=(width-left-right)/12, barWidth=Math.min(13,step*.31);
    for (const [i,row] of rows.entries()) {
      const x=left+(i+.5)*step;
      lines.forEach(([key],j) => {
        const rect=svg("rect",{x:x+(j-1)*barWidth,y:y(row[key]),width:Math.max(1,barWidth-.5),height:Math.max(0,bottom-y(row[key])),fill:colors[j]});
        rect.append(svg("title",{},months[i]+" · "+lines[j][1]+" · "+format(row[key],2)+" "+chart.unit)); chartSvg.append(rect);
      });
      if (width>370 || i%2===0) chartSvg.append(svg("text",{x,y:height-7,fill:"#496157","text-anchor":"middle","font-size":10},months[i]));
    }
    holder.replaceChildren(chartSvg);
    get("chart-title").textContent=chart.title; get("chart-unit").textContent=chart.unit;
    get("tech-legend").replaceChildren(...lines.map(([,name],i)=>{
      const label=make("span",name), sample=make("i"); sample.style.background=colors[i]; label.prepend(sample); return label;
    }));
  }

  function interpretation(v,y) {
    if (id === "pad") {
      return y.water > 0 ? message("padWater", {
        used:format(y.water), budget:format(v.budget,0), rate:format(1000*y.saved/y.water)
      }) : ui.padDry;
    }
    if (id === "air") return message(y.saved < 0 ? "airMore" : "airLess", {
      change:format(Math.abs(y.saved),2), actual:format(y.plant), base:format(y.reference), hours:format(y.frostHours,0)
    });
    if (id === "tank") return message("tankResult", {
      peak:format(y.peakBefore), charged:format(y.charged), loss:format(y.loss), stock:format(y.stock,2)
    });
    if (id === "solar") return message("solarResult", {
      capacity:format(v.area*.2,0), direct:format(y.direct), load:format(y.load), spill:format(y.spill)
    });
    if (id === "glycol") return message(y.saved < 0 ? "glycolMore" : "glycolLess", {
      rise:site.formatNumber(data.plant.loop_rise_k),
      duty:site.formatNumber(data.plant.it_kw/1000),
      water:format(y.waterPump,2), fluid:format(y.pump,2), change:format(Math.abs(y.saved),2)
    });
    const balance = message("coldResult",{balance:format(y.balance), resistance:format(y.resistance,3)});
    return y.canApplyCapture ? balance : balance+" "+ui.probeWarning;
  }
  function render() {
    const config=studies[id];
    document.querySelector(".case-share").classList.toggle("private-readings", id === "cold" && coldMode === "measured");
    stationInfo();
    const entered=Object.fromEntries([...fields].map(([key,input])=>[key,input.value]));
    if (id === "cold") coldStates.set(coldMode,entered);
    else states.set(id,entered);
    const v=Object.fromEntries(Object.entries(entered).map(([key,value])=>[key,Number(value)]));
    if (fields.has("supply") && fields.get("supply").validity.valid) supply=v.supply;
    const valid=form.checkValidity();
    const error=get("tech-error");
    error.textContent=valid?"":(id==="cold"&&coldMode==="measured"?ui.invalidCold:ui.invalidInput);
    error.hidden=valid; get("tech-output").hidden=!valid; get("monthly-details").hidden=!monthly(id)||!valid;
    get("download-study").disabled=!valid;
    get("result-title").textContent=id==="cold"?ui.coldBalance:cityName(city)+" · "+(id==="glycol"?ui.loopResult:ui.annualResult);
    get("result-type").textContent=id==="cold"?(coldMode==="example"?ui.example:ui.userMeasured):
      (id==="glycol"?message("duty",{power:site.formatNumber(data.plant.it_kw/1000)}):message("hours",{count:format(8760,0)}));
    if (!valid) { latest=null; return; }
    let w;
    if (hasCity(id)) {
      if (!weatherCache.has(city.slug)) weatherCache.set(city.slug,TechnologyModel.weather(data.weather[city.slug]));
      w=weatherCache.get(city.slug);
    }
    const result=monthly(id) ? TechnologyModel.hourly(id,w,v,data.plant) :
      {year:id==="glycol" ? TechnologyModel.glycol(w,v,data.plant) : TechnologyModel.cold(v)};
    latest={v,result};
    const y=result.year;
    get("tech-metrics").replaceChildren(...config.metrics.map(([k,label,unit,digits])=>{
      const increase = k === "saved" && y[k] < 0;
      const container=make("div");
      container.append(make("span",increase ? ui.additionalUse : label),
        make("strong",format(increase ? -y[k] : y[k],digits)),make("small",unit));
      return container;
    }));
    get("interpretation").textContent=interpretation(v,y);
    heatLink.hidden = id !== "cold" || !y.canApplyCapture;
    if (!heatLink.hidden) {
      const destination = new URL(heatURL);
      destination.searchParams.set("city",city.slug);
      destination.searchParams.set("capture",y.capture.toFixed(1));
      destination.searchParams.set("from","cold-plate");
      destination.searchParams.set("supply",supply);
      heatLink.href=destination.href;
    }
    if (monthly(id)) {
      const cells=obj=>config.columns.map(([k,,unit])=>format(obj[k],unit===text.units.h&&k!=="wetHours"?0:2));
      drawTable("tech-table",[ui.period,...config.columns.map(([,label,unit])=>label+" ("+unit+")")],
        result.rows.map((r,i)=>[site.months[i],...cells(r)]),[ui.year,...cells(y)]);
      drawMonthlyChart(result.rows,config.chart);
    } else {
      drawTable("bench-results",[ui.quantity,ui.result],
        config.columns.map(([key,label,unit])=>[label,format(y[key],key==="resistance"?4:(key==="exposure"||key==="reynolds"?0:2))+" "+unit]));
    }
  }

  CaseShare.register(() => {
    if (!latest || (id === "cold" && coldMode === "measured") || !form.checkValidity()) return null;
    const params = new URLSearchParams({study:id, city:city.slug, supply});
    for (const [key, value] of Object.entries(latest.v)) params.set(key, value);
    const details = [studies[id].title, hasCity(id) ? cityName(city) : ui.example,
      ...CaseShare.describeFields([...fields.values()]), ...CaseShare.resultLines(), get("interpretation").textContent];
    return {params, details, anchor:"model"};
  });
  citySelect.addEventListener("change",()=>{
    city=data.stations.find(s=>s.slug===citySelect.value); render(); setAddress();
  });
  form.addEventListener("input",event=>{
    if (event.target!==citySelect && event.target.id!=="reading-mode") {
      render();
      if (latest) setAddress();
    }
  });
  form.addEventListener("change",event=>{
    if (fields.has(event.target.name)) { render(); if (latest) setAddress(); }
  });
  form.addEventListener("submit",e=>e.preventDefault());
  get("reset").addEventListener("click",()=>{
    states.delete(id);
    if (monthly(id)) supply=18;
    if (id==="cold") { coldMode="example"; coldStates.clear(); }
    addInputs(); render(); setAddress();
  });
  get("download-study").addEventListener("click",()=>{
    if (!latest) return;
    const {v,result}=latest, config=studies[id];
    const headers=[ui.study,ui.scenario,...(hasCity(id)?[ui.city,ui.stationId,ui.epwSource,ui.sourcePeriod,ui.sourceYears,ui.weatherArchive,ui.epwOffset,ui.stationNote]:[]),
      ...config.inputs.map(f=>f.label+" ("+f.unit+")"),ui.csvPeriod,...config.columns.map(([,label,unit])=>label+" ("+unit+")")];
    const prefix=[config.title,id==="cold"?(coldMode==="example"?ui.example:ui.userMeasured):ui.modelled,
      ...(hasCity(id)?[cityName(city),city.station_id,city.epw_source,city.period,city.source_years,city.source_url,city.utc_offset,get("weather-origin").textContent]:[]),...config.inputs.map(f=>v[f.id])];
    const row=(period,values)=>[...prefix,period,...config.columns.map(([key])=>numberForCsv(values[key]))];
    const body=(result.rows||[]).map((r,i)=>row(months[i],r));
    body.push(row(id==="cold"?ui.run:ui.year,result.year));
    download((hasCity(id)?city.slug+"-":"")+id+"-results.csv",[headers,...body]);
  });
  window.addEventListener("resize",()=>{
    if(latest && monthly(id)) drawMonthlyChart(latest.result.rows,studies[id].chart);
  });
  window.addEventListener("popstate",()=>{
    const here=new URL(location.href);
    city=data.stations.find(s=>s.slug===here.searchParams.get("city")) || data.stations.find(s=>s.slug==="astana");
    citySelect.value=city.slug;
    const setpoint=Number(here.searchParams.get("supply"));
    supply=setpoint>=8 && setpoint<=32 && Number.isInteger(setpoint*2) ? setpoint : 18;
    restoreScenario(here);
    openStudy(here.searchParams.get("study"));
  });
  restoreScenario(url);
  // Actual measurements stay out of URLs. Pass the current form only when the
  // reader explicitly switches languages, and consume it on the destination.
  const draftKey = "kazdc-cold-plate-language";
  const draft = LabView.takeLanguageDraft(draftKey);
  if (coldMode === "measured" && draft && draft.readings) {
    const readings = {};
    for (const {id:field} of studies.cold.inputs) {
      if (typeof draft.readings[field] === "string") readings[field] = draft.readings[field];
    }
    coldStates.set("measured",readings);
  }
  LabView.onLanguageChange(draftKey, () => {
    if (id === "cold" && coldMode === "measured") return {readings: coldStates.get("measured")};
  });
  openStudy(url.searchParams.get("study"));
})();
