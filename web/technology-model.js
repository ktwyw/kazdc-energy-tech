"use strict";

const TechnologyModel = (() => {
  // EPW hourly records run from midnight to midnight in local standard time.
  const monthDays = [31,28,31,30,31,30,31,31,30,31,30,31];
  const calendar = monthDays.flatMap((days, month) => Array(days * 24).fill(month));
  const keys = {
    pad:["reference","plant","saved","water","wetHours","extraOff","off"],
    air:["reference","plant","saved","fans","compressor","off","frostHours"],
    tank:["reference","plant","saved","charged","released","loss","stock","peakBefore","peakAfter"],
    solar:["load","pv","direct","charge","discharge","loss","grid","spill","stock","peakBefore","peakAfter"]
  };

  function decode(encoded, scale) {
    const bytes = Uint8Array.from(atob(encoded), c => c.charCodeAt(0));
    const view = new DataView(bytes.buffer);
    const result = new Float64Array(bytes.length / 2);
    for (let i = 0; i < result.length; i++) result[i] = view.getInt16(i * 2, true) / scale;
    return result;
  }

  function weather(encoded) {
    return {dry:decode(encoded.dry,10), wet:decode(encoded.wet,10), solar:decode(encoded.solar,1), utcOffset:encoded.utc_offset};
  }

  function totals(rows, fields) {
    const year = {};
    for (const field of fields) {
      if (field === "stock") year[field] = rows[rows.length-1][field];
      else if (field.startsWith("peak")) year[field] = Math.max(...rows.map(row => row[field]));
      else year[field] = rows.reduce((sum, row) => sum + row[field], 0);
    }
    return year;
  }

  // Same full-fan heat capacity, economic bypass, and cold-hour cycling as cooling.py.
  function dryPlant(t, supply, p) {
    const capacity = p.it_kw * Math.max(0, supply + p.loop_rise_k - t) / (p.loop_rise_k + p.rated_approach_k);
    const usable = capacity > p.dry_fan_kw * p.chiller_cop * (1 + 1e-12);
    const full = capacity >= p.it_kw * (1 - 1e-12);
    const dry = usable ? (full ? p.it_kw : Math.min(p.it_kw, capacity)) : 0;
    const duty = dry > 0 ? Math.min(1, dry / capacity) : 0;
    const compressor = (p.it_kw - dry) / p.chiller_cop;
    return {capacity, dry, duty, compressor, off:dry === p.it_kw,
      power:p.loop_pump_kw + duty * p.dry_fan_kw + compressor};
  }

  function padHour(t, wet, month, v, p, base, row, state) {
    let water = 0, sprayRuntime = 0, extra = 0, saving = 0;
    if (month >= 5 && month <= 7 && t >= v.trigger && !base.off && v.effect > 0 && state.water > 0) {
      const drop = v.effect / 100 * Math.max(0, t - wet);
      const assisted = dryPlant(t - drop, v.supply, p);
      // Airflow is the full-speed dry-air mass flow. The pad and its pump run with the fan.
      const fullWater = 100 * 1.006 * drop / 2450 * 3.6 * assisted.duty * 1.10;
      const benefit = base.power - assisted.power - 2 * assisted.duty;
      if (benefit > 0 && fullWater > 0) {
        const fraction = Math.min(1,state.water / fullWater);
        sprayRuntime = fraction * assisted.duty;
        water = fraction * fullWater;
        state.water = Math.max(0,state.water-water);
        saving = fraction * benefit;
        extra = Number(assisted.off && fraction === 1);
      }
    }
    row.reference += base.power / 1000;
    row.plant += (base.power - saving) / 1000;
    row.saved += saving / 1000;
    row.water += water;
    row.wetHours += sprayRuntime;
    row.extraOff += extra;
    row.off += Number(base.off) + extra;
  }

  function airHour(t, v, p, base, row) {
    const airReturn = v.airSupply + v.airRise;
    const available = v.effect / 100 * p.it_kw / v.airRise * Math.max(0, airReturn - t);
    const locked = t < v.frost;
    const breakEven = v.fan * p.chiller_cop;
    // Decimal setpoints can put a mathematically exact boundary a few ulps to either side.
    const tolerance = 1e-12 * Math.max(p.it_kw, breakEven);
    const economical = available > breakEven + tolerance;
    const full = available >= p.it_kw * (1 - 1e-12);
    const free = !locked && economical ? (full ? p.it_kw : available) : 0;
    const fan = free > 0 ? v.fan * Math.min(1, free / available) : 0;
    const compressor = (p.it_kw - free) / p.chiller_cop;
    const power = fan + compressor + p.loop_pump_kw;
    row.reference += base.power / 1000;
    row.plant += power / 1000;
    row.saved += (base.power-power) / 1000;
    row.fans += fan / 1000;
    row.compressor += compressor / 1000;
    row.off += Number(free === p.it_kw);
    row.frostHours += Number(locked);
  }

  function tankHour(hour, v, p, base, row, state) {
    const capacity = v.volume * 1000 * 4.18 * p.loop_rise_k / 3600;
    const loss = state.stock * (1 - Math.pow(1 - v.loss / 100, 1 / 24));
    state.stock -= loss;
    let charge = 0, release = 0;
    if ((hour < 6 || hour >= 22) && base.off) {
      charge = Math.min(v.rate, Math.max(0,capacity-state.stock), Math.max(0,base.capacity - p.it_kw));
    } else if (hour >= 12 && hour < 20) {
      release = Math.min(v.rate, state.stock, base.compressor * p.chiller_cop);
    }
    const extraFan = charge > 0 ? p.dry_fan_kw * charge / base.capacity : 0;
    const extraPump = .01 * (charge + release);
    const power = base.power + extraFan + extraPump - release / p.chiller_cop;
    state.stock = Math.max(0, state.stock + charge - release);
    row.reference += base.power / 1000;
    row.plant += power / 1000;
    row.saved += (base.power-power) / 1000;
    row.charged += charge / 1000;
    row.released += release / 1000;
    row.loss += loss / 1000;
    row.stock = state.stock / 1000;
    row.peakBefore = Math.max(row.peakBefore, base.power);
    row.peakAfter = Math.max(row.peakAfter, power);
  }

  function solarHour(t, radiation, v, p, base, row, state) {
    const load = p.it_kw + base.power;
    const cell = t + (45 - 20) * radiation / 800;
    const dc = v.area * .20 * radiation / 1000 * Math.max(0,1 - .004 * (cell-25));
    const pv = Math.max(0,Math.min(v.area * .20, dc * .90 * .96));
    const direct = Math.min(pv, load);
    const minStock = v.battery * v.reserve / 100;
    const efficiency = .95;
    const charge = Math.max(0, Math.min(pv-direct, v.inverter, (v.battery-state.stock) / efficiency));
    const discharge = Math.max(0, Math.min(load-direct, v.inverter, (state.stock-minStock) * efficiency));
    state.stock = Math.max(minStock, Math.min(v.battery, state.stock + charge*efficiency - discharge/efficiency));
    const grid = load - direct - discharge;
    row.load += load/1000;
    row.pv += pv/1000;
    row.direct += direct/1000;
    row.charge += charge/1000;
    row.discharge += discharge/1000;
    row.loss += (charge*(1-efficiency) + discharge*(1/efficiency-1))/1000;
    row.grid += grid/1000;
    row.spill += (pv-direct-charge)/1000;
    row.stock = state.stock/1000;
    row.peakBefore = Math.max(row.peakBefore, load);
    row.peakAfter = Math.max(row.peakAfter, grid);
  }

  function hourly(study, w, v, plant) {
    const fields = keys[study];
    if (study === "tank" && !Number.isFinite(w.utcOffset)) throw new Error("Tank dispatch requires the EPW time offset.");
    const rows = monthDays.map(() => Object.fromEntries(fields.map(key => [key, 0])));
    const state = {water:v.budget, stock:study === "solar" ? v.battery * v.reserve / 100 : 0};
    for (let i = 0; i < w.dry.length; i++) {
      const month = calendar[i], t = w.dry[i], row = rows[month];
      const base = dryPlant(t,v.supply,plant);
      if (study === "pad") padHour(t,w.wet[i],month,v,plant,base,row,state);
      if (study === "air") airHour(t,v,plant,base,row);
      if (study === "tank") {
        // Dispatch by current Kazakhstan civil time. Month totals retain EPW month labels.
        const civilHour = (i + 24 + 5 - w.utcOffset) % 24;
        tankHour(civilHour,v,plant,base,row,state);
      }
      if (study === "solar") solarHour(t,w.solar[i],v,plant,base,row,state);
    }
    return {rows, year:totals(rows,fields)};
  }

  // DOWFROST guide, tables 3, 10, 14 and 22. First ice is interpolated at PG
  // volume fractions; array columns are 0, 10, 20 and 30 °C bulk fluid temperature.
  const mixtures = {
    0:{ice:0, rho:[999.84,999.70,998.21,995.65], mu:[1.793,1.307,1.002,.7977], cp:[4.2176,4.1921,4.1818,4.1784]},
    20:{ice:-7.4, rho:[1027,1023.8,1020.2,1016], mu:[4.05,2.79,2.02,1.52], cp:[3.929,3.951,3.973,3.994]},
    30:{ice:-13.1, rho:[1037.4,1033.7,1029.5,1024.8], mu:[7.07,4.52,3.06,2.19], cp:[3.793,3.820,3.848,3.875]},
    40:{ice:-21.5, rho:[1046.3,1042.1,1037.4,1032.2], mu:[12.30,7.21,4.59,3.12], cp:[3.636,3.669,3.702,3.735]},
    50:{ice:-33.65, rho:[1053.9,1049.2,1044,1038.3], mu:[18.28,10.59,6.62,4.41], cp:[3.455,3.493,3.532,3.570]},
    60:{ice:-51.1, rho:[1060.2,1055.1,1049.4,1043.3], mu:[31.32,17.05,10.04,6.34], cp:[3.250,3.295,3.339,3.383]}
  };

  function pipe(v, concentration, load, rise) {
    const fluid = mixtures[concentration];
    const index = Math.min(2, Math.floor(v.fluid / 10)), weight = v.fluid / 10 - index;
    const interpolate = values => values[index] * (1-weight) + values[index+1] * weight;
    const rho = interpolate(fluid.rho), cp = interpolate(fluid.cp);
    const mu = Math.exp(interpolate(fluid.mu.map(n => Math.log(n)))) / 1000;
    const flow = load / (rho * cp * rise), velocity = flow / (Math.PI * v.diameter**2 / 4);
    const reynolds = rho * velocity * v.diameter / mu;
    const turbulent = re => .25 / Math.log10(.000045 / (3.7 * v.diameter) + 5.74 / re**.9)**2;
    let friction = 64 / reynolds;
    if (reynolds >= 4000) friction = turbulent(reynolds);
    else if (reynolds > 2300) friction = 64/2300 + (reynolds-2300)/1700 * (turbulent(4000) - 64/2300);
    const drop = (friction * v.length / v.diameter + 10) * rho * velocity**2 / 2;
    return {flow:flow*1000, drop:drop/1000, pump:drop * flow / (v.efficiency/100) / 1000,
      ice:fluid.ice, rho, cp, mu:mu*1000, reynolds};
  }

  function glycol(w, v, plant) {
    const mixture = pipe(v,v.mix,plant.it_kw,plant.loop_rise_k);
    const water = pipe(v,0,plant.it_kw,plant.loop_rise_k);
    const timeFraction = v.duration/100;
    const adjusted = pipe(v,v.mix,plant.it_kw,v.rise);
    const adjustedWater = pipe(v,0,plant.it_kw,v.rise);
    const variable = ((1-timeFraction)*mixture.pump + timeFraction*adjusted.pump) * 8.76;
    const waterEnergy = ((1-timeFraction)*water.pump + timeFraction*adjustedWater.pump) * 8.76;
    return {...mixture, waterPump:water.pump, waterEnergy, adjustedPump:adjusted.pump,
      adjustedFlow:adjusted.flow, constant:mixture.pump*8.76, variable, saved:mixture.pump*8.76-variable,
      exposure:w.dry.reduce((n,t) => n + Number(t < mixture.ice), 0)};
  }

  function cold(v) {
    const delta = v.outlet - v.inlet;
    const liquid = v.flow * 4180 * delta;
    const capture = liquid/v.heater*100;
    const pump = v.drop * 1000 * (v.flow/1000) / (v.efficiency/100);
    const resistance = (v.plate-v.inlet)/v.heater;
    const canApplyCapture = capture >= 0 && capture <= 100 && resistance >= 0;
    return {delta, liquid, capture, pump, balance:v.heater-liquid, resistance, canApplyCapture};
  }

  return {weather, dryPlant, hourly, glycol, cold};
})();
if (typeof module !== "undefined" && module.exports) module.exports = TechnologyModel;
