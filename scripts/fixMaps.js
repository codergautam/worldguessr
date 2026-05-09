#!/usr/bin/env node
// Run mapcheckr-cli --worldguessr (fix-in-place) on every map JSON file:
//   - data/world-main.json
//   - data/*.json (daily-challenge, diverse-locations, world-arbitrary, world-pinpointable)
//   - data/mapOverrides/*.json
//
// Usage: node scripts/fixMaps.js [extra mapcheckr args...]
//        node scripts/fixMaps.js --only data/mapOverrides/VN.json
//
// Any args after `--` (or unrecognized) are forwarded to mapcheckr-cli.

import { spawnSync } from "node:child_process";
import { readdirSync, statSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

function listJson(dir) {
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
        .filter((f) => f.toLowerCase().endsWith(".json"))
        .map((f) => join(dir, f))
        .filter((p) => statSync(p).isFile());
}

const argv = process.argv.slice(2);
let only = null;
const extra = [];
for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--only") {
        only = argv[++i];
    } else {
        extra.push(argv[i]);
    }
}

const targets = only
    ? [resolve(repoRoot, only)]
    : [
          ...listJson(join(repoRoot, "data")),
          ...listJson(join(repoRoot, "data/mapOverrides")),
      ];

const missing = targets.filter((p) => !existsSync(p));
if (missing.length) {
    console.error("Missing files:\n  " + missing.join("\n  "));
    process.exit(1);
}

console.log(`Running mapcheckr-cli --worldguessr on ${targets.length} file(s):`);
for (const t of targets) console.log("  " + t);
console.log();

const failures = [];
for (const file of targets) {
    console.log(`\n=== ${file} ===`);
    const args = [
        "--yes",
        "mapcheckr-cli",
        file,
        "--worldguessr",
        ...extra,
    ];
    const res = spawnSync("npx", args, { stdio: "inherit", cwd: repoRoot });
    if (res.status !== 0) {
        failures.push({ file, code: res.status, signal: res.signal });
    }
}

console.log("\n----------------------------------------");
if (failures.length === 0) {
    console.log(`All ${targets.length} map file(s) processed successfully.`);
    process.exit(0);
} else {
    console.error(
        `${failures.length}/${targets.length} file(s) failed:`,
    );
    for (const f of failures) {
        console.error(`  ${f.file} (exit ${f.code}${f.signal ? `, signal ${f.signal}` : ""})`);
    }
    process.exit(1);
}
