#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const simulator = path.join(root, "scripts", "simulate-runs.js");

function runSample(seedPrefix) {
  return execFileSync(
    process.execPath,
    [simulator, `--runs=40`, `--seed=${seedPrefix}`, `--max-floor=16`, `--forge=2`, `--clinic=2`],
    { cwd: root, encoding: "utf8" },
  );
}

const baseline = runSample("parity-seed");
const repeated = runSample("parity-seed");

assert.equal(baseline, repeated, "Deterministic parity check failed for identical seeded simulations");
console.log("Renderer parity check passed.");
