import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { COUNTRY_MAP_LIST } from "../lib/countryMapList.js";

// lib/countryMapList.js is generated from public/officialCountryMaps.json by
// scripts/writeCountryMapList.mjs. This fails the moment the two drift, so a
// new country map cannot ship without its link on /maps.
describe("countryMapList", () => {
  it("matches public/officialCountryMaps.json", () => {
    const json = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../public/officialCountryMaps.json"), "utf8"));
    const expected = json
      .map((m) => ({ name: m.name, slug: m.slug, countryCode: m.countryCode }))
      .sort((a, b) => a.name.localeCompare(b.name, "en"));
    expect(COUNTRY_MAP_LIST).toEqual(expected);
  });
});
