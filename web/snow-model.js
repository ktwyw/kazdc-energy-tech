"use strict";

// Hourly mean kW over one-hour records is numerically equal to kWh for that hour.
const SnowModel = (() => {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const days = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const latentKwhPerKg = 333.5 / 3600;
  const epsilon = 1e-7;

  function defaultCase(data) {
    return {supply: data.default_supply, volume: 4000, density: 550, retained: 70,
      rating: 500, pump: 5, handling: 0, target: 10, policy: "as-needed", threshold: 25};
  }

  function emptyPeriod(name) {
    return {name, hours: 0, baseline: 0, hybrid: 0, withSnow: 0, snow: 0, remainingDuty: 0,
      residual: 0, eligible: 0, pumping: 0, extraOff: 0, peak: 0, off: 0, stock: null};
  }

  function simulate(data, input) {
    const table = data.supply_tables[String(input.supply)];
    if (!table || !["as-needed", "hot-hours"].includes(input.policy)) throw Error("Invalid dispatch case");
    for (const field of ["volume", "density", "retained", "rating", "pump", "handling", "target", "threshold"]) {
      if (!Number.isFinite(input[field]) || input[field] < 0) throw Error("Invalid " + field);
    }
    if (input.retained > 100 || input.target > 100) throw Error("Percentages must be in the range 0–100");
    const mass = input.volume * input.density;
    const initial = mass * latentKwhPerKg;
    const available = initial * input.retained / 100;
    let stock = available, index = 0, exhaustion = null, summerResidual = 0, summerEligible = 0;
    const periods = months.map(emptyPeriod);
    const dailyStock = [stock];
    const paysToPump = input.rating > data.cop * input.pump;
    for (let m = 0; m < months.length; m++) {
      const month = periods[m];
      const summer = m >= 5 && m <= 7;
      for (let day = 1; day <= days[m]; day++) {
        for (let hour = 1; hour <= 24; hour++, index++) {
          const bin = data.indices[index];
          const [residual, hybrid] = table[bin];
          const outdoor = data.temperatures[bin];
          let usablePower = 0;
          if (summer && paysToPump && (input.policy === "as-needed" || outdoor >= input.threshold)) {
            usablePower = Math.min(input.rating, residual);
          }
          const snow = Math.min(stock, usablePower);
          // Snow can cycle at rated extraction. The loop buffer averages the sub-hour delivery.
          const pump = snow > 0 ? input.pump * snow / input.rating : 0;
          const chiller = Math.max(0, residual - snow);
          if (snow > 0) {
            stock -= snow;
            if (stock <= epsilon && !exhaustion) {
              exhaustion = {month: months[m], day, hour, year: data.years[m]};
            }
          }
          month.hours++;
          month.baseline += data.baseline_kw;
          month.hybrid += hybrid;
          month.withSnow += hybrid - snow / data.cop + pump;
          month.snow += snow;
          month.remainingDuty += chiller;
          month.residual += residual;
          month.pumping += pump;
          month.eligible += usablePower;
          month.peak = Math.max(month.peak, chiller);
          if (chiller <= epsilon) month.off++;
          if (residual > epsilon && chiller <= epsilon) month.extraOff++;
        }
        if (summer) dailyStock.push(stock);
      }
      if (summer) {
        month.stock = stock;
        summerResidual += month.residual;
        summerEligible += month.eligible;
      }
    }
    const annual = emptyPeriod("Annual");
    for (const key of ["hours", "baseline", "hybrid", "withSnow", "snow", "remainingDuty", "residual",
                       "pumping", "extraOff", "off", "eligible"]) {
      annual[key] = periods.reduce((total, row) => total + row[key], 0);
    }
    annual.peak = Math.max(...periods.map(row => row.peak));
    annual.stock = stock;
    const targetKwh = summerResidual * input.target / 100;
    const perM3 = input.density * latentKwhPerKg * input.retained / 100;
    const targetFeasible = targetKwh <= epsilon || (perM3 > 0 && summerEligible + epsilon >= targetKwh);
    const requiredVolume = !targetFeasible ? null : targetKwh <= epsilon ? 0 : targetKwh / perM3;
    const handlingKwh = mass / 1000 * input.handling;
    return {periods, annual, dailyStock, available, initial, stock, exhaustion, summerResidual,
      summerEligible, targetKwh, targetFeasible, requiredVolume, paysToPump, handlingKwh,
      plantSaved: annual.hybrid - annual.withSnow, netSaved: annual.hybrid - annual.withSnow - handlingKwh};
  }

  function campusStock(volume, density, leakageW, hours) {
    const initial = volume * density * latentKwhPerKg;
    const retained = Math.max(0, initial - leakageW * hours / 1000);
    return {initial, retained, iceTonnes: retained / latentKwhPerKg / 1000};
  }

  return {months, defaultCase, simulate, campusStock, latentKwhPerKg};
})();
if (typeof module !== "undefined" && module.exports) module.exports = SnowModel;
