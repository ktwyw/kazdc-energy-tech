"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {cooling, recovery, ups, waterRun} = require("../web/lab-model.js");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const data = JSON.parse(html.match(/<script type="application\/json" id="lab-data">(.*?)<\/script>/s)[1]);
const close = (actual, expected, tol = 1e-6) => assert.ok(Math.abs(actual - expected) < tol,
  actual + " differs from " + expected);
const defaults = {mode:"direct",capture:70,warmReturn:40,target:35,peak:750,cop:4};

test("regional results reproduce independent chronological dispatch and all Astana setpoints", () => {
  const bench = {
    astana:[690.845738,5888], almaty:[808.835,5382], shymkent:[1105.733,4120], atyrau:[1016.768,4648],
    ekibastuz:[717.301636,5691], oskemen:[686.985489,5860],
    aktau:[1067.732086,4301], aktobe:[792.579367,5533], karaganda:[655.011885,6174],
    kokshetau:[632.778971,6128], kostanay:[670.571916,6005], kyzylorda:[1055.300139,4496],
    oral:[786.008887,5520], pavlodar:[686.025666,5974], petropavl:[608.205905,6205],
    qonaev:[1015.547608,4456], semey:[718.452247,5766], taldykorgan:[810.553878,5236],
    taraz:[963.492673,4680], turkistan:[1168.697761,4020], zhezkazgan:[858.491982,5251]
  };
  assert.deepEqual(data.stations.map(station => station.slug).sort(), Object.keys(bench).sort());
  for (const city of data.stations) {
    const {rows,year} = cooling(data,city,18);
    assert.equal(year.hours,8760);
    assert.equal(rows.length,12);
    close(year.baseline,2321.4);
    close(year.hybrid,bench[city.slug][0],.001);
    assert.equal(year.off,bench[city.slug][1]);
  }
  const csv = fs.readFileSync(path.join(__dirname,"..","reference","supply_sweep.csv"),"utf8").trim().split("\n");
  const cols = csv.shift().split(",");
  for (const line of csv) {
    const row = Object.fromEntries(line.split(",").map((value,i)=>[cols[i],Number(value)]));
    const {year} = cooling(data,data.stations[0],row.supply_c);
    close(year.hybrid,row.hybrid_mwh_e);
    assert.equal(year.off,row.off_hours);
  }
});

test("the July experiment and two-city comparison retain monthly differences", () => {
  const expected = [
    ["astana", 74, 313, 140.682470],
    ["ekibastuz", 6, 246, 153.917564],
    ["oskemen", 53, 344, 136.850362]
  ];
  for (const [slug, off18, off24, julyElectricity] of expected) {
    const station = data.stations.find(city => city.slug === slug);
    const at18 = cooling(data, station, 18).rows[6], at24 = cooling(data, station, 24).rows[6];
    assert.equal(at18.hours, 744);
    assert.equal(at18.off, off18);
    assert.equal(at24.off, off24);
    close(at18.hybrid, julyElectricity, .000001);
  }
});

test("both regional studies use each city's hourly temperatures and actual source period", () => {
  const heatHTML = fs.readFileSync(path.join(__dirname, "..", "heat.html"), "utf8");
  const heatData = JSON.parse(heatHTML.match(/<script type="application\/json" id="lab-data">(.*?)<\/script>/s)[1]);
  assert.deepEqual(heatData.stations, data.stations);
  assert.deepEqual(heatData.temperatures, data.temperatures);
  for (const city of data.stations) {
    const [first, last] = city.period.split("–").map(Number);
    assert.equal(city.catalogue_period, "2011–2025");
    assert.equal(first, 2011);
    assert.equal(last, city.slug === "taraz" ? 2021 : 2025);
    assert.equal(city.source_years, ({taraz:10, aktau:14})[city.slug] ?? 15);
    const monthly = Array.from({length:12}, () => ({off:0, demand:0}));
    const records = fs.readFileSync(path.join(__dirname, "..", city.csv), "utf8").trim().split("\n").slice(1);
    for (const line of records) {
      const [year, month, , , temp] = line.split(",").map(Number);
      assert.ok(year >= first && year <= last);
      monthly[month-1].off += Number(temp <= 13);
      monthly[month-1].demand += defaults.peak * Math.max(0, Math.min(1, (15 - temp) / 40)) / 1000;
    }
    const coolingRows = cooling(data,city,18).rows;
    const heatRows = recovery(heatData,city,defaults).rows;
    for (const [index, expected] of monthly.entries()) {
      assert.equal(coolingRows[index].off, expected.off);
      close(heatRows[index].demand, expected.demand);
    }
  }
});

test("heat matching respects source, demand, temperature, and compressor balances", () => {
  const station = data.stations[0];
  const direct = recovery(data,station,defaults);
  const threshold = recovery(data,station,{...defaults,warmReturn:38});
  const blocked = recovery(data,station,{...defaults,warmReturn:37.99});
  const assisted = recovery(data,station,{...defaults,mode:"lift",target:55});
  const bypass = recovery(data,station,{...defaults,mode:"lift"});
  const highLift = {...defaults, mode:"lift", warmReturn:15, target:80, cop:10};
  assert.throws(()=>recovery(data,station,highLift),/reversible limit/);
  assert.throws(()=>recovery(data,station,{...highLift,cop:353.15/71}),/reversible limit/);
  assert.ok(recovery(data,station,{...highLift,cop:4.9}).year.compressor>0);
  assert.throws(()=>recovery(data,station,{...highLift,target:70,cop:6}),/reversible limit/);
  for (const inactive of [{capture:0},{peak:0}]) {
    const result=recovery(data,station,{...highLift,...inactive,cop:null}).year;
    assert.equal(result.delivered,0);
    assert.equal(result.compressor,0);
    assert.equal(result.demand,result.unmet);
  }
  assert.equal(recovery(data,station,{...highLift,mode:"direct"}).year.compressor,0);
  assert.equal(direct.year.compressor,0);
  close(threshold.year.delivered,direct.year.delivered);
  close(bypass.year.delivered,direct.year.delivered);
  assert.ok(direct.year.delivered>0 && direct.year.delivered<direct.year.demand);
  assert.equal(blocked.year.delivered,0);
  close(assisted.year.delivered,assisted.year.compressor*4);
  close(recovery(data,station,{...defaults,mode:"lift",target:55,capture:0}).year.delivered,0);
  close(recovery(data,station,{...defaults,peak:0}).year.delivered,0);
  for (const configuration of [direct,blocked,assisted]) for(const r of configuration.rows) {
    close(r.delivered,r.source+r.compressor);
    close(r.demand,r.delivered+r.unmet);
    assert.ok(r.unmet>=0 && r.source>=0);
  }
  const juneStation = {months:[[[0,1]],...Array.from({length:11},()=>[])]};
  const matched = recovery({...data,temperatures:[-25]},juneStation,{...defaults,mode:"lift",target:55,peak:1000});
  close(matched.year.source,.700);
  close(matched.year.delivered,.700/(1-1/4));
});

test("UPS conserves electrical power and the water balance preserves signs and units", () => {
  const base=ups(1000,94,97);
  close(base.before,1000/.94-1000);close(base.saved,8760*(1000/.94-1000/.97)/1000);
  close(ups(1000,97,94).saved,-base.saved);
  close(ups(1000,100,100).beforeMwh,0);
  const run=waterRun(.1,20,25,30,1.10);
  close(run.duty,2.09);close(run.absorbed,1.045);close(run.gap,.055);close(run.gapPercent,5);
  close(waterRun(.1,25,20,30,1).duty,-2.09);
  assert.equal(waterRun(0,20,25,30,0).gapPercent,null);
});
