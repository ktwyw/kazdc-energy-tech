"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {simulate, defaultCase, campusStock} = require("../web/snow-model.js");
const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "snow.html"), "utf8");
const data = JSON.parse(html.match(/<script id="snow-data" type="application\/json">(.*?)<\/script>/s)[1]);
const base = defaultCase(data);
const close = (a, b, tol = 1e-4) => assert.ok(Math.abs(a - b) < tol, a + " vs " + b);

test("a finite store supplies only residual summer demand and keeps a closed energy balance", () => {
  for (const policy of ["as-needed", "hot-hours"]) {
    const r = simulate(data, {...base, policy, handling:2});
    close(r.initial, 4000 * 550 * 333.5 / 3600);
    close(r.available, r.stock + r.annual.snow);
    close(r.summerResidual, 1321563.63636, 0.1);
    close(r.annual.snow, 142663.88889);
    close(r.annual.residual, r.annual.remainingDuty + r.annual.snow);
    close(r.annual.pumping, r.annual.snow * 5 / 500);
    close(r.annual.withSnow, r.annual.hybrid - r.annual.snow / data.cop + r.annual.pumping);
    close(r.handlingKwh, 4400);
    close(r.netSaved, r.plantSaved - r.handlingKwh);
    r.periods.forEach((p, i) => {
      if (i < 5 || i > 7) { close(p.snow, 0); assert.equal(p.stock, null); }
    });
    assert.equal(r.dailyStock.length, 93);
    for (let i = 1; i < r.dailyStock.length; i++) assert.ok(r.dailyStock[i] <= r.dailyStock[i - 1]);
    close(r.annual.peak, 1000);
    assert.equal(r.annual.extraOff, policy === "as-needed" ? 126 : 0);
    assert.deepEqual(r.exhaustion, policy === "as-needed" ?
      {month:"Jun",day:18,hour:11,year:2022} : {month:"Jul",day:13,hour:16,year:2018});
    const resized = simulate(data, {...base, policy, volume:r.requiredVolume});
    close(resized.annual.snow, r.targetKwh);
  }
});

test("all 49 settings revert to the original annual results at zero store volume", () => {
  const sweep = fs.readFileSync(path.join(root,"reference","supply_sweep.csv"), "utf8").trim().split("\n");
  const keys = sweep.shift().split(",");
  for (const line of sweep) {
    const vals = line.split(",").map(Number);
    const ref = Object.fromEntries(keys.map((k,i) => [k, vals[i]]));
    const r = simulate(data, {...base, supply:ref.supply_c, volume:0});
    close(r.annual.withSnow / 1000, ref.hybrid_mwh_e);
    close(r.annual.baseline / 1000, ref.baseline_mwh_e);
    assert.equal(r.annual.off, ref.off_hours);
    assert.equal(r.annual.extraOff, 0);
    assert.equal(r.exhaustion, null);
  }
});

test("finite power, hot-hour eligibility and pump break-even constrain sizing", () => {
  for (const override of [{rating: 0}, {rating:20,pump:5}, {pump:260},
                           {retained:0}, {density:0}, {policy:"hot-hours",threshold:45}]) {
    const r = simulate(data,{...base,...override});
    close(r.annual.snow,0);
    assert.equal(r.targetFeasible, false);
    assert.equal(r.requiredVolume, null);
  }
  const insufficient = simulate(data, {...base,volume:500000,rating:50,target:100});
  assert.equal(insufficient.targetFeasible, false);
  assert.ok(insufficient.annual.snow > 0 && insufficient.stock > 0);
  close(insufficient.summerEligible,insufficient.annual.snow);
  assert.equal(simulate(data,{...base,target:0,retained:0}).requiredVolume,0);
  assert.ok(simulate(data,{...base,handling:50}).netSaved < 0);
});

test("the stored ice has a lower bound of zero and the audited replay balances every hour", () => {
  close(campusStock(55,550,200,2184).retained, 55*550*333.5/3600-436.8);
  close(campusStock(50,0,200,2184).retained,0);
  for(const condition of ["reference","degraded"]) {
    let backup = 0;
    const rows = data.replay;
    assert.equal(rows.length,169);
    assert.equal(rows[0][condition+"_snow_kw"],null);
    for(let h=1;h<rows.length;h++) {
      const row=rows[h];
      close(row[condition+"_snow_kw"] + row[condition+"_backup_kw"],5,2e-6);
      assert.ok(row[condition+"_ice_kwh"] <= rows[h-1][condition+"_ice_kwh"]);
      backup += row[condition+"_backup_kw"];
    }
    close(backup, condition==="reference" ? 0 : 8.155871, 2e-5);
    close(rows[168][condition+"_ice_kwh"],condition==="reference" ? 313.857784 : 322.013655);
  }
});
