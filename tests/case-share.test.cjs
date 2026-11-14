"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {readFileSync} = require("node:fs");
const {join} = require("node:path");
const {runInNewContext} = require("node:vm");

const script = readFileSync(join(__dirname, "../web/case-share.js"), "utf8");
const labels = {copy:"Copy this case", copied:"Copied.", manual:"Copy the selected text.",
  model:"Model version {version}", link:"Case link: {url}",
  versionNotice:"Shared with version {requested}. Running version {version}."};
const publicURL = "https://example.org/regional-kk.html";

function newPage(address, options = {}) {
  const location = new URL(address);
  const status = {textContent:""};
  const fallback = {hidden:true, value:"", setAttribute(name, value) { this[name] = value; },
    focus() { this.focused = true; }, select() { this.selection = this.value; }};
  const button = {disabled:true, dataset:{caseSection:options.section},
    addEventListener(event, fn) { if (event === "click") this.click = fn; }};
  const wrapper = {querySelector(selector) {
    if (selector.startsWith("button")) return button;
    if (selector.startsWith("output")) return status;
    if (selector.startsWith("textarea")) return fallback;
  }, append(node) { this.notice = node; }};
  const config = {publicURL:options.publicURL || publicURL, version:"1.0.0", labels};
  const document = {readyState:options.loading ? "loading" : "complete", title:"KazDC · Regional cooling",
    addEventListener(event, fn) { if (event === "DOMContentLoaded") this.finish = fn; },
    getElementById(id) {
      if (id === "case-share-data") return {textContent:JSON.stringify(config)};
      if (id === "two-cities" || id === "compare") return {};
    },
    querySelectorAll:() => [wrapper], createElement:() => ({})};
  const written = [];
  const clipboard = options.clipboard === undefined ? {writeText:async text => written.push(text)} : options.clipboard;
  const window = {};
  runInNewContext(script, {window, document, navigator:{clipboard}, location, URL, URLSearchParams});
  return {button, status, fallback, wrapper, written, share:window.CaseShare, document, location};
}

function scenario(supply = 18.5, anchor = "two-cities") {
  return {params:new URLSearchParams({city:"ekibastuz", peer:"oskemen", supply:String(supply)}),
    details:["Екібастұз · Өскемен", supply + " °C"], anchor};
}

test("a portable case shares a public link and current model settings only", async () => {
  const page = newPage("file:///home/local/private/Hub_kk.html?secret=private-field&model=0.8.0#local",
    {loading:true, section:"compare"});
  page.share.register(() => scenario());
  page.location.search = ""; // Some studies clear the version when restoring their settings.
  page.document.finish();
  assert.equal(page.button.disabled, false);
  assert.match(page.wrapper.notice.textContent, /0\.8\.0.*1\.0\.0/);
  await page.button.click();
  const [text] = page.written;
  assert.match(text, /KazDC · Regional cooling\nЕкібастұз · Өскемен\n18.5 °C\nModel version 1.0.0/);
  assert.doesNotMatch(text, /private|secret|local\/|file:/);
  const link = new URL(text.split("Case link: ")[1]);
  assert.equal(link.origin + link.pathname, publicURL);
  assert.deepEqual(Object.fromEntries(link.searchParams), {city:"ekibastuz",peer:"oskemen",supply:"18.5",model:"1.0.0"});
  assert.equal(link.hash, "#compare");
});

test("denied clipboard access selects the complete case and clears it when settings change", async () => {
  const page = newPage("https://example.org/?model=1.0.0", {clipboard:{writeText:async () => {throw Error("denied");}}});
  let state = scenario();
  page.share.register(() => state);
  await page.button.click();
  assert.equal(page.fallback.hidden, false);
  assert.equal(page.fallback.focused, true);
  assert.equal(page.fallback.selection, page.fallback.value);
  assert.equal(page.fallback["aria-label"], labels.manual);
  assert.match(page.fallback.value, /#two-cities$/);
  assert.equal(page.status.textContent, labels.manual);
  assert.equal(page.wrapper.notice, undefined);
  page.share.refresh();
  assert.equal(page.fallback.hidden, false);
  state = scenario(24);
  page.share.refresh();
  assert.equal(page.status.textContent, "");
  assert.equal(page.fallback.value, "");
  assert.equal(page.fallback.hidden, true);
  state = null;
  page.share.refresh();
  assert.equal(page.button.disabled, true);
  await page.button.click();
  assert.equal(page.status.textContent, "");
});

test("an outdated clipboard operation cannot claim the new case was copied or expose stale text", async () => {
  for (const fail of [false, true]) {
    let finish;
    const page = newPage("https://example.org/", {clipboard:{writeText:() => new Promise((resolve,reject) => {
      finish = () => fail ? reject(Error("denied")) : resolve();
    })}});
    let state = scenario();
    page.share.register(() => state);
    const pending = page.button.click();
    state = scenario(24);
    page.share.refresh();
    finish();
    await pending;
    assert.equal(page.status.textContent, "");
    assert.equal(page.fallback.hidden, true);
  }
});

test("unknown anchors are dropped, and local paths cannot be used as canonical share links", async () => {
  const page = newPage("https://example.org/");
  page.share.register(() => scenario(18, "no-such-section"));
  await page.button.click();
  assert.doesNotMatch(page.written[0], /#/);
  const local = newPage("file:///tmp/case.html", {publicURL:"file:///tmp/case.html"});
  local.share.register(() => scenario());
  assert.equal(local.button.disabled, true);
});
