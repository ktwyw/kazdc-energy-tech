"use strict";

const {test} = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../web/lab-common.js"), "utf8");
const key = "worksheet";
const draft = {measured:true, values:{name:"Practice", heater:"345", flow:""}};

function tab(start) {
  let click;
  const values = new Map();
  const env = {URL, location:new URL(start), window:{name:""},
    document:{documentElement:{lang:"en"}, querySelector:() => ({
      addEventListener:(_event,handler) => { click = handler; }
    })},
    sessionStorage:{getItem:k=>values.get(k), setItem:(k,v)=>values.set(k,v), removeItem:k=>values.delete(k)}};
  const view = vm.runInNewContext(source + "\nLabView", env);
  view.onLanguageChange(key, () => draft);
  return {
    follow(target, modifiers = {}) {
      const link = {href:new URL(target,env.location).href, hreflang:"kk"};
      click({target:{closest:()=>link}, button:0, ...modifiers});
    },
    arrive(target, language = "kk") {
      env.location = new URL(target,env.location);
      env.document.documentElement.lang = language;
      const record = view.takeLanguageDraft(key);
      return record && JSON.parse(JSON.stringify(record));
    }
  };
}

test("a language switch transfers partial readings through a clean-URL redirect and only once", () => {
  const page = tab("https://example.org/bench");
  page.follow("bench-kk.html#measurements");
  assert.deepEqual(page.arrive("bench-kk#measurements"), draft);
  assert.equal(page.arrive("bench-kk"), undefined);
  page.follow("bench-kk.html");
  assert.deepEqual(page.arrive("bench-kk/"), draft);
});

test("unrelated routes, languages and new-tab clicks do not receive experiment readings", () => {
  const page = tab("https://example.org/bench");
  page.follow("bench-kk.html");
  assert.equal(page.arrive("other-kk"), undefined);
  page.follow("bench-kk.html");
  assert.equal(page.arrive("bench-kk", "ru"), undefined);
  page.follow("bench-kk.html", {ctrlKey:true});
  assert.equal(page.arrive("bench-kk"), undefined);
});

test("portable HTML files transfer the same draft to the exact local target", () => {
  const page = tab("file:///kazdc/KazDC_Experiment.html");
  page.follow("KazDC_Experiment_kk.html");
  assert.deepEqual(page.arrive("KazDC_Experiment_kk.html"), draft);
  assert.equal(page.arrive("KazDC_Experiment_kk.html"), undefined);
});
