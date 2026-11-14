"use strict";

const MonthlyChart = (() => {
  function svgNode(tag, attrs, label) {
    const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    if (label !== undefined) node.textContent = label;
    return node;
  }

  function draw(id, series, months, label, climate = false) {
    const holder = document.getElementById(id);
    const width = Math.max(250, Math.round(holder.getBoundingClientRect().width));
    const height = climate ? Math.min(215, width * .46) : Math.min(208, width * .45);
    const left = climate ? 32 : 45, right = 15, top = 12, bottom = height - 27;
    const values = series.flatMap(s => s.values);
    const low = climate ? Math.min(-20, Math.floor(Math.min(...values) / 10) * 10) : 0;
    const hiValue = Math.max(1, ...values);
    const tickStep = climate ? 10 : Math.max(.25, Math.ceil(hiValue / 4 / 10) * 10);
    const high = climate ? Math.max(30, Math.ceil(hiValue / 10) * 10) : Math.ceil(hiValue / tickStep) * tickStep;
    const x = i => left + i * (width - left - right) / 11;
    const y = value => bottom - (value - low) * (bottom - top) / (high - low);
    const ink = climate ? "#cfe3d4" : "#50655a";
    const svg = svgNode("svg", {viewBox: "0 0 " + width + " " + height, role:"img", "aria-label":label});
    for (let v = low; v <= high; v += tickStep) {
      svg.append(svgNode("line", {x1:left,y1:y(v),x2:width-right,y2:y(v),stroke:climate?"#53766a":"#d9dfd6",
        "stroke-width": v === 0 ? 1.2 : .7, "stroke-dasharray":v === 0 ? "none":"3 4"}));
      svg.append(svgNode("text", {x:left-6,y:y(v)+3,"text-anchor":"end",fill:ink,"font-size":10},window.SiteI18n.formatNumber(v)));
    }
    for (const [i, month] of months.entries()) {
      if (width < 425 && i % 2) continue;
      svg.append(svgNode("text", {x:x(i),y:height-5,"text-anchor":"middle",fill:ink,"font-size":10},month));
    }
    for (const s of series) {
      const points = s.values.map((val, i) => x(i) + "," + y(val)).join(" ");
      const line = svgNode("polyline", {points,fill:"none",stroke:s.color,"stroke-width":s.weight||2,
        "stroke-linejoin":"round","stroke-linecap":"round","stroke-dasharray":s.dash||"none"});
      line.append(svgNode("title", {}, s.name));
      svg.append(line);
      if (s.mark) s.values.forEach((v, i) => svg.append(svgNode("circle",
        {cx:x(i),cy:y(v),r:2.7,fill:s.color})));
    }
    holder.replaceChildren(svg);
  }

  return {draw};
})();
