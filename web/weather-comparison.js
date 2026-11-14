"use strict";

(() => {
  const data = JSON.parse(document.getElementById("weather-data").textContent);
  const city = document.getElementById("climate-city");
  const peer = document.getElementById("climate-peer");
  const byId = new Map(data.cities.map(row => [row.slug, row]));
  const sorted = [...data.cities].sort((a, b) => a.name.localeCompare(b.name, document.documentElement.lang));
  for (const select of [city, peer]) {
    for (const row of sorted) select.add(new Option(row.name, row.slug));
  }
  const query = new URLSearchParams(location.search);
  city.value = byId.has(query.get("city")) ? query.get("city") : "astana";
  peer.value = byId.has(query.get("peer")) ? query.get("peer") : "shymkent";
  let previousCity = "";
  function draw(withTable = false) {
    const first = byId.get(city.value), second = byId.get(peer.value);
    const label = data.chart.replace("{first}", first.name).replace("{second}", second.name);
    MonthlyChart.draw("weather-chart", [
      {name:second.name, values:second.means, color:"#ebc888", weight:2, dash:"5 4"},
      {name:first.name, values:first.means, color:"#a5e5bd", weight:3, mark:true}
    ], data.months, label, true);
    if (withTable) {
      document.getElementById("weather-caption").textContent = label;
      document.getElementById("weather-first").textContent = first.name;
      document.getElementById("weather-second").textContent = second.name;
      const rows = window.SiteI18n.months.map((month, index) => {
        const row = document.createElement("tr");
        const header = document.createElement("th");
        header.scope = "row";
        header.textContent = month;
        row.append(header);
        for (const city of [first, second]) {
          row.insertCell().textContent = window.SiteI18n.formatNumber(city.means[index],
            {minimumFractionDigits:1, maximumFractionDigits:1});
        }
        return row;
      });
      document.getElementById("weather-rows").replaceChildren(...rows);
      document.getElementById("weather-values").hidden = false;
    }
  }
  function update(changed = false) {
    if (city.value === peer.value) {
      peer.value = previousCity && previousCity !== city.value ? previousCity : (city.value === "astana" ? "shymkent" : "astana");
    }
    previousCity = city.value;
    for (const option of peer.options) option.disabled = option.value === city.value;
    const address = new URL(location.href);
    if (changed || query.has("city") || query.has("peer")) {
      address.searchParams.set("city", city.value);
      address.searchParams.set("peer", peer.value);
    }
    if (changed && /^https?:$/.test(location.protocol)) history.replaceState(null, "", address);
    for (const link of document.querySelectorAll('[data-reference-language], [data-weather-return], [data-study-link="regional"]')) {
      const target = new URL(link.href);
      target.search = address.search;
      link.href = target.href;
    }
    draw(true);
  }
  city.addEventListener("change", () => update(true));
  peer.addEventListener("change", () => update(true));
  window.addEventListener("resize", () => draw());
  update();
})();
