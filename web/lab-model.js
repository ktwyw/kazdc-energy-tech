"use strict";

const EnergyLab = (() => {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  function cooling(data, station, supply) {
    const table = data.cooling[supply];
    if (!table) throw new Error("Select a supply temperature in the supported range.");
    const rows = station.months.map((bins, month) => {
      let hours = 0, hybrid = 0, off = 0, degreeHours = 0;
      for (const [bin, count] of bins) {
        const [power, chillerOff] = table[bin];
        hours += count;
        hybrid += count * power / 1000;
        off += count * chillerOff;
        degreeHours += count * data.temperatures[bin];
      }
      return {month: months[month], hours, baseline: hours * data.baseline_kw / 1000, hybrid, off, mean: degreeHours / hours};
    });
    return {rows, year: total(rows, ["hours", "baseline", "hybrid", "off"])};
  }

  function total(rows, keys) {
    return Object.fromEntries(keys.map(key => [key, rows.reduce((sum, row) => sum + row[key], 0)]));
  }

  function heatingCopLimit(warmReturn, target) {
    // The flow-modulated source circuit cools by 6 K whenever the heat pump runs.
    const leavingSource = warmReturn - 6;
    return target > leavingSource ? (target + 273.15) / (target - leavingSource) : Infinity;
  }

  function recovery(data, station, inputs) {
    const {capture, warmReturn, target, peak, cop, mode} = inputs;
    const heatCapacity = data.it_kw * capture / 100;
    const directPossible = warmReturn >= target + 3;
    const activeLift = mode === "lift" && !directPossible && heatCapacity > 0 && peak > 0;
    if (activeLift &&
        !(cop > 1 && cop < heatingCopLimit(warmReturn, target))) {
      throw new RangeError("Heating COP must exceed 1 and stay below the reversible limit.");
    }
    const rows = station.months.map((bins, month) => {
      const row = {month: months[month], demand: 0, delivered: 0, source: 0, compressor: 0, unmet: 0};
      for (const [bin, count] of bins) {
        const temp = data.temperatures[bin];
        const demand = peak * Math.max(0, Math.min(1, (15 - temp) / 40));
        let delivered = 0, compressor = 0;
        if (mode === "direct" || directPossible) {
          if (directPossible) delivered = Math.min(demand, heatCapacity);
        } else if (activeLift) {
          delivered = Math.min(demand, heatCapacity / (1 - 1 / cop));
          compressor = delivered / cop;
        }
        const duration = count / 1000;
        row.demand += demand * duration;
        row.delivered += delivered * duration;
        row.compressor += compressor * duration;
        row.source += (delivered - compressor) * duration;
        row.unmet += (demand - delivered) * duration;
      }
      return row;
    });
    return {rows, year: total(rows, ["demand", "delivered", "source", "compressor", "unmet"]), directPossible};
  }

  function ups(load, reference, alternative, hours = 8760) {
    const loss = efficiency => load * (100 / efficiency - 1);
    const before = loss(reference), after = loss(alternative);
    return {before, after, beforeMwh: before * hours / 1000, afterMwh: after * hours / 1000,
      saved: (before - after) * hours / 1000};
  }

  function waterRun(flow, inlet, outlet, minutes, energy) {
    const duty = flow * 4.18 * (outlet - inlet);
    const absorbed = duty * minutes / 60;
    return {duty, absorbed, gap: energy - absorbed, gapPercent: energy ? (energy - absorbed) / energy * 100 : null};
  }

  return {months, cooling, recovery, heatingCopLimit, ups, waterRun};
})();
if (typeof module !== "undefined" && module.exports) module.exports = EnergyLab;
