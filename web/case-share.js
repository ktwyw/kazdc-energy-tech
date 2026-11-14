"use strict";

window.CaseShare = (() => {
  // A study can replace its address during startup. Retain the version on the incoming link.
  const incomingVersion = new URLSearchParams(location.search).get("model");
  const cards = [];
  let config, provider;

  function caseText(button) {
    const state = provider && provider(button);
    if (!state) return "";
    // The provider supplies validated model parameters, never raw readings or the incoming query.
    const link = new URL(config.publicURL);
    if (link.protocol !== "https:" && link.protocol !== "http:") return "";
    link.search = state.params.toString();
    link.searchParams.set("model", config.version);
    const anchor = (button.dataset.caseSection || state.anchor || "").replace(/^#/, "");
    link.hash = /^[A-Za-z][\w-]*$/.test(anchor) && document.getElementById(anchor) ? anchor : "";
    return [document.title, ...state.details, config.labels.model.replace("{version}", config.version),
      config.labels.link.replace("{url}", link.href)].join("\n");
  }

  function update(card) {
    const text = caseText(card.button);
    card.button.disabled = !text;
    if (card.text === text) return;
    card.text = text;
    card.revision++;
    card.fallback.hidden = true;
    card.fallback.value = "";
    card.status.textContent = "";
  }

  function refresh() {
    cards.forEach(update);
  }

  function describeFields(fields) {
    return fields.filter(field => !field.disabled).map(field => {
      const label = field.labels[0]?.cloneNode(true);
      label?.querySelectorAll("input,select,output,button,textarea").forEach(node => node.remove());
      const name = label?.textContent.trim().replace(/\s+/g," ") || field.name;
      const value = field.selectedOptions ? field.selectedOptions[0].textContent
        : window.SiteI18n.formatNumber(field.valueAsNumber, {maximumSignificantDigits:15});
      return name + " · " + value;
    });
  }
  function resultLines() {
    return [...document.querySelectorAll(".metrics > div")].map(metric =>
      [...metric.children].map(el => el.textContent.trim()).filter(Boolean).join(" "));
  }

  async function copy(card) {
    update(card);
    if (!card.text) return;
    const revision = ++card.revision;
    try {
      await navigator.clipboard.writeText(card.text);
      if (revision !== card.revision) return;
      card.fallback.hidden = true;
      card.status.textContent = config.labels.copied;
    } catch {
      // Offline browsers and restricted clipboards can still copy selected, plain text.
      if (revision !== card.revision) return;
      card.status.textContent = config.labels.manual;
      card.fallback.value = card.text;
      card.fallback.hidden = false;
      card.fallback.focus();
      card.fallback.select();
    }
  }

  function bind() {
    const script = document.getElementById("case-share-data");
    if (!script) return;
    config = JSON.parse(script.textContent);
    for (const wrapper of document.querySelectorAll(".case-share")) {
      wrapper.hidden = false;
      const card = {button:wrapper.querySelector("button[data-copy-case]"),
        status:wrapper.querySelector('output[role="status"]'),
        fallback:wrapper.querySelector("textarea[readonly]"), text:"", revision:0};
      card.fallback.setAttribute("aria-label", config.labels.manual);
      if (incomingVersion && incomingVersion !== config.version) {
        const notice = document.createElement("p");
        notice.className = "case-version-note";
        const shownVersion = /^\d+(?:\.\d+){0,3}(?:-[a-z\d.-]{1,35})?$/i.test(incomingVersion) ? incomingVersion : "–";
        notice.textContent = config.labels.versionNotice.replace("{requested}", shownVersion)
          .replace("{version}", config.version);
        wrapper.append(notice);
      }
      card.button.addEventListener("click", () => copy(card));
      cards.push(card);
    }
    refresh();
    // These bubble after each study has validated and rendered its new settings.
    for (const event of ["input","change","click"]) document.addEventListener(event, refresh);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind, {once:true});
  else bind();
  return {register(getCase) { provider = getCase; refresh(); }, refresh, describeFields, resultLines};
})();
