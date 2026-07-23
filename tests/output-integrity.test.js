import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { ROOT, htmlPages, stateFiles, parsePage } from "./helpers.js";

/* The HTML here is generated elsewhere and committed weekly; these tests
   validate each published snapshot so a generator regression is caught at
   the repo instead of in production. */

const pages = htmlPages();
const states = stateFiles();

function inlineScript(path) {
  const m = readFileSync(path, "utf8").match(/<script>([\s\S]*?)<\/script>/);
  return m && m[1];
}

describe.each(pages)("$name", ({ name, path }) => {
  const doc = parsePage(name).window.document;

  it("references only local assets that exist", () => {
    const refs = new Set();
    for (const el of doc.querySelectorAll("[src]")) refs.add(el.getAttribute("src"));
    for (const el of doc.querySelectorAll("link[href]")) refs.add(el.getAttribute("href"));
    const html = readFileSync(path, "utf8");
    for (const m of html.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)) refs.add(m[1]);

    const local = [...refs].filter(r =>
      r && !/^(https?:)?\/\//.test(r) && !r.startsWith("data:") && !r.startsWith("#"));
    expect(local.length).toBeGreaterThan(0); // the poster background, at minimum
    for (const ref of local) {
      const resolved = join(dirname(path), ref.split("#")[0].split("?")[0]);
      expect(existsSync(resolved), `${ref} referenced by ${name}`).toBe(true);
    }
  });

  it("has profile links that are well-formed and safe", () => {
    const links = [...doc.querySelectorAll("a.name")];
    expect(links.length).toBeGreaterThan(0);
    for (const a of links) {
      const row = a.closest(".row");
      const url = new URL(a.getAttribute("href"));
      const slug = decodeURIComponent(url.pathname.split("/").pop());
      // the URL slug and the row's search key must both match the shown name
      expect(slug.toLowerCase()).toBe(a.textContent.trim().toLowerCase());
      expect(row.getAttribute("data-name")).toBe(a.textContent.trim().toLowerCase());
      expect(a.getAttribute("target")).toBe("_blank");
      expect(a.getAttribute("rel")).toContain("noopener");
    }
  });

  it("has a hero progress bar consistent with the kills/pulls tiles", () => {
    const tiles = Object.fromEntries([...doc.querySelectorAll(".tile")].map(t => [
      t.querySelector(".lbl").textContent.trim(),
      t.querySelector(".val").firstChild.textContent.trim(),
    ]));
    const kills = Number(tiles.KILLS);
    const pulls = Number(tiles.PULLS);
    expect(Number.isInteger(kills)).toBe(true);
    expect(Number.isInteger(pulls)).toBe(true);
    expect(pulls).toBeGreaterThanOrEqual(kills);

    const pct = (kills / pulls) * 100;
    const width = parseFloat(doc.querySelector(".bar2 .fill").style.width);
    expect(Math.abs(width - pct)).toBeLessThan(0.15);
    expect(doc.querySelector(".bar2 .cap").textContent)
      .toBe(`${kills} kills in ${pulls} pulls (${Math.round(pct)}%)`);
  });
});

describe("page ↔ state consistency", () => {
  const pairs = [
    { name: "index.html", date: states[states.length - 1].date },
    ...states.filter(s => existsSync(join(ROOT, `archive/${s.date}.html`)))
      .map(s => ({ name: `archive/${s.date}.html`, date: s.date })),
  ];

  it.each(pairs)("$name shows the top-5 season scores from data/$date-state.json", ({ name, date }) => {
    const doc = parsePage(name).window.document;
    const sec = [...doc.querySelectorAll(".sec")]
      .find(s => s.querySelector(".sec-h .t")?.textContent === "SEASON M+ SCORES");
    const shown = [...sec.querySelectorAll(".row[data-name]")].map(r => ({
      name: r.getAttribute("data-name"),
      score: Number(r.querySelector(".value").firstChild.textContent.trim()),
    }));

    const { state } = states.find(s => s.date === date);
    const top = Object.entries(state.season_scores)
      .sort((a, b) => b[1] - a[1])
      .slice(0, shown.length)
      .map(([n, s]) => ({ name: n, score: Math.round(s) }));
    expect(shown).toEqual(top);
  });
});

describe("published snapshots", () => {
  it("keeps the inline script identical on every page (no copy drift)", () => {
    const reference = inlineScript(join(ROOT, "index.html"));
    expect(reference).toBeTruthy();
    for (const { name, path } of pages) {
      expect(inlineScript(path), `script in ${name}`).toBe(reference);
    }
  });

  it("archives the current week as an exact copy of index.html", () => {
    const latest = pages[pages.length - 1];
    expect(readFileSync(latest.path, "utf8")).toBe(readFileSync(join(ROOT, "index.html"), "utf8"));
  });
});
