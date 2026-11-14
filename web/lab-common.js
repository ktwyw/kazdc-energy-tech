"use strict";

const LabView = (() => {
  function make(tag, value, className) {
    const node = document.createElement(tag);
    if (value !== undefined) node.textContent = value;
    if (className) node.className = className;
    return node;
  }

  function drawTable(id, headers, body, footer) {
    const holder = document.getElementById(id);
    holder.replaceChildren();
    const head = holder.createTHead(), bodyNode = document.createElement("tbody");
    const top = head.insertRow();
    for (const label of headers) {
      const cell = make("th", label);
      cell.scope = "col";
      top.append(cell);
    }
    function appendRow(target, values) {
      const tr = target.insertRow();
      for (const [index, value] of values.entries()) {
        const cell = make(index === 0 ? "th" : "td", value);
        if (index === 0) cell.scope = "row";
        tr.append(cell);
      }
    }
    body.forEach(values => appendRow(bodyNode, values));
    if (footer) {
      const foot = document.createElement("tfoot");
      appendRow(foot, footer);
      holder.replaceChildren(head, bodyNode, foot);
    } else {
      holder.replaceChildren(head, bodyNode);
    }
  }

  function download(name, rows) {
    function quote(value) {
      const text = String(value);
      return '"' + text.replace(/"/g, '""') + '"';
    }
    const body = rows.map(row => row.map(quote).join(",")).join("\r\n") + "\r\n";
    const prefix = document.documentElement.lang === "en" ? "" : "\uFEFF";
    const url = URL.createObjectURL(new Blob([prefix, body], {type:"text/csv;charset=utf-8"}));
    const link = make("a");
    link.href = url;
    link.download = name;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  // A draft may be carried once to the reader's chosen language in this tab.
  // On the web the host may redirect a link ending in .html to an extensionless URL.
  function draftPath(path) {
    return location.protocol === "file:" ? path : path.replace(/\.html\/?$|\/$/i, "");
  }

  function onLanguageChange(key, getDraft) {
    document.querySelector(".language-menu").addEventListener("click", event => {
      const link = event.target.closest("a[hreflang]");
      if (!link || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey ||
          event.shiftKey || event.altKey || (link.target && link.target !== "_self")) return;
      const target = new URL(link.href);
      if (target.origin !== location.origin) return;
      const draft = getDraft();
      if (!draft) return;
      const record = JSON.stringify({path: target.pathname, language: link.hreflang, draft});
      if (target.protocol === "file:") window.name = key + ":" + record;
      else {
        try { sessionStorage.setItem(key, record); } catch { /* Storage may be disabled. */ }
      }
    });
  }

  function takeLanguageDraft(key) {
    let raw;
    if (location.protocol === "file:") {
      const prefix = key + ":";
      if (window.name.startsWith(prefix)) {
        raw = window.name.slice(prefix.length);
        window.name = "";
      }
    } else {
      try {
        raw = sessionStorage.getItem(key);
        sessionStorage.removeItem(key);
      } catch { /* Storage may be disabled. */ }
    }
    if (!raw) return;
    try {
      const record = JSON.parse(raw);
      if (typeof record.path === "string" && draftPath(record.path) === draftPath(location.pathname) &&
          record.language === document.documentElement.lang) return record.draft;
    } catch { /* Ignore damaged or older records. */ }
  }

  return {make, drawTable, download, onLanguageChange, takeLanguageDraft,
    weatherOrigin: station => window.SiteI18n.stationNote(station)};
})();
