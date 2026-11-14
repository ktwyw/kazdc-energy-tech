"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Tech = require("../web/technology-model.js");
const {cooling} = require("../web/lab-model.js");
function payload(file) {
  const html = fs.readFileSync(path.join(__dirname,"..",file),"utf8");
  return JSON.parse(html.match(/id="lab-data">(.*?)<\/script>/s)[1]);
}
const page=payload("technologies.html"), regional=payload("index.html"), p=page.plant;
const near=(a,b,tol=1e-7)=>assert.ok(Math.abs(a-b)<tol,`${a} vs ${b}`);
const dryWeather = city=>Tech.weather(page.weather[city]);
const pad={supply:18,budget:300,effect:75,trigger:22};
const air={supply:18,airSupply:25,airRise:10,effect:70,fan:45,frost:-15};
const tank={supply:18,volume:250,rate:300,loss:1};
const solar={supply:18,area:12000,battery:2000,inverter:600,reserve:20};

test("all 21 chronological dry series reproduce the regional cooling reference across setpoints",()=>{
  assert.equal(page.stations.length,21);
  for (const station of regional.stations) {
    const w=dryWeather(station.slug);
    for (const key of ["dry","wet","solar"]) assert.equal(w[key].length,8760);
    assert.ok(w.wet.every((wet,i)=>wet<=w.dry[i]) && w.solar.every(n=>n>=0));
    for (const supply of Object.keys(regional.cooling).map(Number)) {
      const expected=cooling(regional,station,supply).year;
      const rows=w.dry.map(t=>Tech.dryPlant(t,supply,p).power);
      near(rows.reduce((a,b)=>a+b,0)/1000,expected.hybrid);
      assert.equal(w.dry.reduce((a,t)=>a+Number(Tech.dryPlant(t,supply,p).off),0),expected.off);
    }
  }
});

test("pad obeys its water budget, charges auxiliaries and counts only completely chiller-free hours",()=>{
  const w=dryWeather("astana");
  const ref=Tech.hourly("pad",w,{...pad,budget:0},p).year;
  near(ref.reference,690.845738,1e-6); near(ref.plant,ref.reference); assert.equal(ref.off,5888);
  for (const v of [{...pad,budget:0},{...pad,effect:0}]) {
    const y=Tech.hourly("pad",w,v,p).year;
    assert.equal(y.water,0); assert.equal(y.extraOff,0); near(y.saved,0);
  }
  const climate={dry:Array(8760).fill(0),wet:Array(8760).fill(0)};
  const june=151*24; climate.dry[june]=24; climate.wet[june]=10;
  // At full effectiveness, 24 °C becomes 10 °C. The dry reference has its chiller on.
  const full=Tech.hourly("pad",climate,{...pad,effect:100},p).year;
  const dry=Tech.dryPlant(24,18,p), assisted=Tech.dryPlant(10,18,p);
  const expectedWater=100*1.006*14/2450*3.6*1.10*assisted.duty;
  near(full.water,expectedWater); near(full.saved,(dry.power-assisted.power-2*assisted.duty)/1000);
  assert.equal(full.extraOff,1);near(full.wetHours,assisted.duty);
  climate.dry[june]=22.3; climate.wet[june]=12.3;
  const boundary={...pad,supply:19,effect:83};
  assert.equal(Tech.hourly("pad",climate,boundary,p).year.extraOff,1);
  assert.equal(Tech.hourly("pad",climate,{...boundary,effect:82},p).year.extraOff,0);
  climate.dry[june]=24; climate.wet[june]=10;
  const half=Tech.hourly("pad",climate,{...pad,effect:100,budget:expectedWater/2},p).year;
  near(half.wetHours,.5*assisted.duty);near(half.water,expectedWater/2);near(half.saved,full.saved/2);assert.equal(half.extraOff,0);
});

test("closed air exchanger bypasses below the frost limit and at economic break-even",()=>{
  const simulate=(t,inputs)=>Tech.hourly("air",{dry:[t]},inputs,p).year;
  const cold=simulate(-16,air); assert.equal(cold.frostHours,1); near(cold.plant,.265);
  const full=simulate(15,air);
  assert.equal(full.off,1);near(full.fans,.045/1.4);near(full.plant,full.fans+.015);
  const bypass=simulate(25,{...air,effect:0});near(bypass.plant,.265);
  const t=simulate(34,{...air,effect:100,fan:25});
  near(t.plant,.265); assert.equal(t.off,0);
  const exactFull={...air,airSupply:25.5,airRise:9.5,effect:25};
  assert.equal(simulate(-3,exactFull).off,1);
  assert.equal(simulate(-2.9,exactFull).off,0);
  assert.equal(Tech.hourly("air",dryWeather("astana"),exactFull,p).year.off,1952);
  const tie={...air,airRise:14,effect:26,fan:195};
  assert.equal(simulate(-3,tie).fans,0);
  assert.ok(simulate(-3.1,tie).fans>0);
});

test("water tank draws on spare night capacity and closes the monthly thermal balance",()=>{
  const w=dryWeather("ekibastuz");
  for (const zero of [{...tank,volume:0},{...tank,rate:0}]) {
    const y=Tech.hourly("tank",w,zero,p).year;near(y.plant,y.reference);near(y.released,0);
  }
  // An unusually costly dry cooler can be bypassed despite having spare thermal capacity.
  assert.equal(Tech.hourly("tank",{dry:[8],utcOffset:5},tank,{...p,dry_fan_kw:500}).year.charged,0);
  const s=Tech.hourly("tank",{dry:[8],utcOffset:5},tank,p).year;
  near(s.charged,.3);near(s.plant-s.reference,(25*300/(16000/11)+3)/1000);
  // At 06:00 file time a UTC+6 station is still in the charging window at 05:00 UTC+5.
  const lastNightHour=Array(7).fill(30); lastNightHour[6]=8;
  near(Tech.hourly("tank",{dry:lastNightHour,utcOffset:6},tank,p).year.charged,.3);
  near(Tech.hourly("tank",{dry:lastNightHour,utcOffset:5},tank,p).year.charged,0);
  assert.throws(()=>Tech.hourly("tank",{dry:[8]},tank,p),/time offset/);
  let stock=0;
  const {rows,year}=Tech.hourly("tank",w,tank,p);
  for (const row of rows) {
    near(stock+row.charged-row.released-row.loss,row.stock);
    assert.ok(row.stock>=0 && row.stock<=tank.volume*4.18*6/3600+1e-9);
    stock=row.stock;
  }
  near(year.stock,stock);near(year.reference-year.plant,year.saved);assert.ok(year.released>0);
});

test("PV and storage close AC and inventory balances for all cities, with a protected reserve",()=>{
  for (const s of page.stations) {
    const {year,rows}=Tech.hourly("solar",dryWeather(s.slug),solar,p);
    let stock=solar.battery*solar.reserve/100/1000;
    for (const row of rows) {
      near(row.pv,row.direct+row.charge+row.spill);
      near(row.load,row.direct+row.discharge+row.grid);
      near(stock + row.charge*.95 - row.discharge/.95,row.stock);
      assert.ok(row.stock>=.4-1e-9 && row.stock<=2+1e-9);
      stock=row.stock;
    }
    near(year.stock,stock); assert.ok(year.peakAfter<=year.peakBefore);
  }
  const w=dryWeather("astana");
  const empty=Tech.hourly("solar",w,{...solar,area:0},p).year;
  near(empty.load,empty.grid);near(empty.discharge,0);
  for(const input of [{...solar,reserve:100},{...solar,battery:0},{...solar,inverter:0}]) {
    const y=Tech.hourly("solar",w,input,p).year;near(y.charge,0);near(y.discharge,0);near(y.grid,y.load-y.direct);
  }
  const one=Tech.hourly("solar",{dry:[25],solar:[800]},solar,p).year;
  near(one.pv,12000*.20*.8*(1-.004*25)*.90*.96/1000);
});

test("glycol pipe circuit and cold plate reproduce independent engineering checks",()=>{
  const v={mix:30,fluid:20,diameter:.2,length:100,efficiency:75,rise:8,duration:50};
  const w=dryWeather("oskemen");
  const g=Tech.glycol(w,v,p);near(g.pump,1.02156,.00002);near(g.waterPump,.79005,.00002);
  near(g.flow,42.0714,.0001);near(g.drop,18.2112,.0002);
  near(g.adjustedFlow/g.flow,6/8);near(g.variable,8.76*(g.pump+g.adjustedPump)/2);
  assert.equal(g.exposure,w.dry.reduce((n,t)=>n+Number(t < -13.1),0));assert.ok(g.saved>0);
  near(Tech.glycol(w,{...v,duration:0},p).saved,0);
  near(Tech.glycol(w,{...v,rise:6},p).saved,0);
  const cold={heater:300,flow:.020,inlet:24,outlet:27,plate:42,drop:20,efficiency:40};
  const y=Tech.cold(cold);near(y.liquid,250.8);near(y.capture,83.6);near(y.pump,1);near(y.resistance,.06);
  assert.equal(y.canApplyCapture, true);
  for (const changes of [{plate:20}, {outlet:40}, {outlet:20}]) {
    assert.equal(Tech.cold({...cold,...changes}).canApplyCapture, false);
  }
  assert.ok(Tech.cold({...cold,outlet:40}).capture>100);assert.ok(Tech.cold({...cold,outlet:20}).capture<0);
});
