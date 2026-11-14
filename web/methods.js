"use strict";

(() => {
  const trace = JSON.parse(document.getElementById("trace-data").textContent);
  const text = trace.text;
  const select = document.getElementById("example");
  const format = value => window.SiteI18n.formatNumber(value, {maximumFractionDigits: 2});

  function showHour() {
    const e = trace.examples[Number(select.value)];
    const values = {...trace, ...e, mode: e.mode_label, duty: 100 * e.fan_duty,
      saved: e.baseline_kw_e - e.hybrid_kw_e};
    function line(template) {
      return template.replace(/\{(\w+)\}/g, (_, key) => {
        const value = values[key];
        return typeof value === "number" ? format(value) : value;
      });
    }
    document.getElementById("trace-title").textContent = line(text.trace_title);
    const dispatchText = {chiller_only: text.dispatch_bypass, assisted: text.dispatch_assisted, dry_only: text.dispatch_full};
    const descriptions = [text.capacity, dispatchText[e.mode], text.balance, text.fan, text.electric];
    const list = document.createElement("dl");
    for (const [index, description] of descriptions.entries()) {
      const row = document.createElement("div");
      const dt = document.createElement("dt"), dd = document.createElement("dd");
      dt.textContent = text.terms[index];
      dd.textContent = line(description);
      row.append(dt, dd);
      list.append(row);
    }
    document.getElementById("trace-steps").replaceChildren(list);
  }

  function updateLinks() {
    for (const link of document.querySelectorAll(".language-menu a[hreflang]")) {
      const url = new URL(link.href);
      url.searchParams.set("example", select.value);
      link.href = url.href;
    }
  }

  const query = new URLSearchParams(location.search);
  if ([...select.options].some(option => option.value === query.get("example"))) {
    select.value = query.get("example");
    updateLinks();
  }
  select.addEventListener("change", () => {
    if (/^https?:$/.test(location.protocol)) {
      const url = new URL(location.href);
      url.searchParams.set("example", select.value);
      history.replaceState(null, "", url);
    }
    updateLinks();
    showHour();
  });
  document.querySelector(".interactive-trace").hidden = false;
  showHour();
})();
