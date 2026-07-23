import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { ROOT, stateFiles } from "./helpers.js";

/* Contract tests for the weekly state files the generator commits. These
   guard the data the board's numbers are derived from. */

const files = stateFiles();
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function expectScores(scores) {
  expect(Object.keys(scores).length).toBeGreaterThan(0);
  for (const [name, score] of Object.entries(scores)) {
    expect(name).toBe(name.toLowerCase());
    expect(name.length).toBeGreaterThan(0);
    expect(typeof score).toBe("number");
    expect(Number.isFinite(score)).toBe(true);
    expect(score).toBeGreaterThanOrEqual(0);
  }
}

function expectStanding(standing) {
  for (const key of ["realm", "region", "world"]) {
    expect(Number.isInteger(standing[key]), `${key} rank`).toBe(true);
    expect(standing[key]).toBeGreaterThan(0);
  }
}

function expectRecords(records) {
  const key = records.highest_timed_key;
  expect(Number.isInteger(key.level)).toBe(true);
  expect(key.level).toBeGreaterThan(0);
  expect(key.dungeon.length).toBeGreaterThan(0);
  expect(typeof key.new).toBe("boolean");
  for (const rec of [records.best_dps_parse, records.best_hps_parse]) {
    expect(Number.isInteger(rec.parse)).toBe(true);
    expect(rec.parse).toBeGreaterThanOrEqual(0);
    expect(rec.parse).toBeLessThanOrEqual(100);
    expect(rec.boss.length).toBeGreaterThan(0);
    expect(typeof rec.new).toBe("boolean");
  }
}

describe.each(files)("data/$date-state.json", ({ date, state }) => {
  it("has a last_updated timestamp matching the file's date", () => {
    expect(Number.isNaN(Date.parse(state.last_updated))).toBe(false);
    expect(state.last_updated.startsWith(date)).toBe(true);
  });

  it("has valid guild standing ranks", () => {
    expectStanding(state.standing);
    expectStanding(state.baseline.standing);
  });

  it("has well-formed season scores", () => {
    expectScores(state.season_scores);
    expectScores(state.baseline.season_scores);
  });

  it("has attendance streaks that are positive integers for known players", () => {
    for (const [name, weeks] of Object.entries(state.streaks)) {
      expect(name).toBe(name.toLowerCase());
      expect(Number.isInteger(weeks), `${name} streak`).toBe(true);
      expect(weeks).toBeGreaterThanOrEqual(1);
    }
    expect(state.streaks_week).toMatch(DATE);
    expect(state.streaks_started).toMatch(DATE);
    expect(state.streaks_started <= state.streaks_week).toBe(true);
  });

  it("has well-formed guild records in state and baseline", () => {
    expectRecords(state.records);
    expectRecords(state.baseline.records);
  });
});

describe("cross-week invariants", () => {
  it("each week's baseline equals the previous week's state", () => {
    for (let i = 1; i < files.length; i++) {
      const prev = files[i - 1].state;
      const cur = files[i].state;
      expect(cur.baseline.standing, `baseline standing for ${files[i].date}`)
        .toEqual(prev.standing);
      expect(cur.baseline.season_scores, `baseline scores for ${files[i].date}`)
        .toEqual(prev.season_scores);
      expect(cur.baseline.records, `baseline records for ${files[i].date}`)
        .toEqual(prev.records);
    }
  });
});

describe("archive manifest", () => {
  const manifest = JSON.parse(readFileSync(join(ROOT, "archive/index.json"), "utf8"));

  it("is an array of dates sorted newest first", () => {
    expect(Array.isArray(manifest)).toBe(true);
    expect(manifest.length).toBeGreaterThan(0);
    for (const w of manifest) expect(w).toMatch(DATE);
    expect(manifest).toEqual([...manifest].sort().reverse());
  });

  it("matches the archived pages one-to-one", () => {
    const pages = readdirSync(join(ROOT, "archive"))
      .filter(f => f.endsWith(".html"))
      .map(f => f.replace(".html", ""))
      .sort().reverse();
    expect(manifest).toEqual(pages);
  });

  it("has a state file for every archived week", () => {
    for (const w of manifest) {
      expect(files.map(f => f.date), `state for ${w}`).toContain(w);
    }
  });
});
