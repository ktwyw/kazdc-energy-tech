"use strict";

const {test} = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const technologyStudies = require("../web/technology-studies.js");

const root = path.join(__dirname, "..", "web", "i18n");
const localeText = language => JSON.parse(fs.readFileSync(path.join(root, language, "technology.json"), "utf8"));
const plant = {it_kw: 1000, loop_rise_k: 6};
const english = localeText("en");
const reference = technologyStudies(english, plant, "en-US");
const placeholders = text => [...text.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();

test("every workbench translation uses the same inputs, source links, data columns and chart series", () => {
  for (const language of ["en", "zh-Hans", "ru", "kk"]) {
    const text = localeText(language);
    const studies = technologyStudies(text, plant, language);
    for (const group of ["labels","units","ui","studies"]) {
      assert.deepEqual(Object.keys(text[group]).sort(), Object.keys(english[group]).sort(), language+" "+group);
    }
    for (const [key, value] of Object.entries(text.ui)) {
      assert.ok(value.trim(), language+" "+key);
      assert.deepEqual(placeholders(value), placeholders(english.ui[key]), language+" "+key);
    }
    for (const [key, study] of Object.entries(studies)) {
      const ref = reference[key];
      assert.deepEqual(study.inputs.map(({label,unit,...rest}) => rest), ref.inputs.map(({label,unit,...rest}) => rest));
      assert.deepEqual(study.metrics.map(([id,,,digits]) => [id,digits]), ref.metrics.map(([id,,,digits]) => [id,digits]));
      assert.deepEqual(study.columns.map(row=>row[0]), ref.columns.map(row=>row[0]));
      assert.deepEqual(study.chart?.lines.map(row => row[0]), ref.chart?.lines.map(row => row[0]));
      assert.deepEqual(study.sources.map(([url])=>url), ref.sources.map(([url])=>url));
      assert.equal(study.method.length, ref.method.length);
      for (const [heading, paragraph] of study.method) {
        assert.ok(heading.trim() && paragraph.trim(), language+" "+key);
      }
      assert.doesNotMatch(JSON.stringify(study), /\{\{(?:IT_MW|LOOP_RISE)\}\}/);
      if (language !== "en") {
        for (const attr of ["nav","title","question","category","assumptions"]) assert.notEqual(study[attr], ref[attr]);
        study.method.forEach(([h,p], i) => {assert.notEqual(h, ref.method[i][0]); assert.notEqual(p, ref.method[i][1]);});
      }
    }
  }
});
