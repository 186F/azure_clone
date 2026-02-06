#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const core = require("../core.js");

function runCoreTests() {
  const hashA = core.fnv1aHash("moonlight");
  const hashB = core.fnv1aHash("moonlight");
  const hashC = core.fnv1aHash("tower");
  assert.equal(hashA, hashB, "Hash should be deterministic");
  assert.notEqual(hashA, hashC, "Different inputs should hash differently");

  const rngA = core.createSeededRandom("seed-alpha");
  const rngB = core.createSeededRandom("seed-alpha");
  const rngC = core.createSeededRandom("seed-beta");

  const seqA = Array.from({ length: 6 }, () => rngA());
  const seqB = Array.from({ length: 6 }, () => rngB());
  const seqC = Array.from({ length: 6 }, () => rngC());

  assert.deepEqual(seqA, seqB, "Same seed should produce identical sequence");
  assert.notDeepEqual(seqA, seqC, "Different seeds should diverge");

  const weighted = [
    { id: "low", weight: 1 },
    { id: "high", weight: 9 },
  ];
  assert.equal(
    core.weightedPick(weighted, () => 0.0).id,
    "low",
    "Roll at start should pick first bucket",
  );
  assert.equal(
    core.weightedPick(weighted, () => 0.99).id,
    "high",
    "Roll near end should pick final bucket",
  );

  const runState = core.createRunState(44);
  assert.equal(runState.collapseAt, 44, "Run state should keep provided collapse threshold");
  assert.equal(runState.gold, 0);
  assert.ok(runState.warnings instanceof Set, "Run state warnings should be a Set");

  assert.equal(
    core.calculateCollapseTurn(62, 2, 28, 5, 0),
    52,
    "Base collapse turn formula mismatch",
  );
  assert.equal(
    core.calculateCollapseTurn(62, 2, 28, 20, 6),
    28,
    "Collapse turn should clamp to minimum",
  );
}

runCoreTests();
console.log("Core tests passed.");
