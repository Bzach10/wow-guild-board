import { describe, it, expect } from "vitest";
import { loadLive } from "./helpers.js";

/* Behavior of the inline progressive-enhancement script, exercised on the
   real shipped index.html in jsdom. */

describe("role classification", () => {
  it("assigns a data-role to every player row", async () => {
    const dom = await loadLive("index.html");
    const rows = [...dom.window.document.querySelectorAll(".row[data-name]")];
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(["dps", "healer", "tank"]).toContain(r.getAttribute("data-role"));
    }
  });

  it("classifies Unholy as dps, not healer (regression: 'unholy' contains 'holy')", async () => {
    const dom = await loadLive("index.html");
    const unholy = [...dom.window.document.querySelectorAll(".row[data-name]")]
      .filter(r => /\bunholy\b/.test(r.getAttribute("data-tags")));
    expect(unholy.length).toBeGreaterThan(0);
    for (const r of unholy) expect(r.getAttribute("data-role")).toBe("dps");
  });

  it.each([
    ["holy", "healer"],
    ["discipline", "healer"],
    ["restoration", "healer"],
    ["mistweaver", "healer"],
    ["brewmaster", "tank"],
    ["vengeance", "tank"],
    ["guardian", "tank"],
    ["shadow", "dps"],
    ["beastmastery", "dps"],
    ["devourer", "dps"], // unknown/new specs must default to dps
  ])("classifies %s rows as %s", async (token, role) => {
    const dom = await loadLive("index.html");
    const rows = [...dom.window.document.querySelectorAll(".row[data-name]")]
      .filter(r => new RegExp(`\\b${token}\\b`).test(r.getAttribute("data-tags")));
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(r.getAttribute("data-role")).toBe(role);
  });
});

describe("role filter + search", () => {
  it("reveals the filter buttons and search box once the script runs", async () => {
    const dom = await loadLive("index.html");
    const doc = dom.window.document;
    expect(doc.getElementById("filters").hidden).toBe(false);
    expect(doc.getElementById("search").hidden).toBe(false);
  });

  it("clicking Healers hides non-healer rows and all-dps sections", async () => {
    const dom = await loadLive("index.html");
    const doc = dom.window.document;
    doc.querySelector('#filters button[data-role="healer"]').click();

    for (const r of doc.querySelectorAll(".row[data-name]")) {
      const hidden = r.classList.contains("nohit");
      expect(hidden).toBe(r.getAttribute("data-role") !== "healer");
    }
    const dpsSec = [...doc.querySelectorAll(".sec")]
      .find(s => s.textContent.includes("TOP DPS PARSES · MYTHIC"));
    expect(dpsSec.classList.contains("nohit")).toBe(true);
    const healSec = [...doc.querySelectorAll(".sec")]
      .find(s => s.textContent.includes("TOP HEALING PARSES · MYTHIC"));
    expect(healSec.classList.contains("nohit")).toBe(false);
  });

  it("search narrows rows by name substring, case-insensitively", async () => {
    const dom = await loadLive("index.html");
    const doc = dom.window.document;
    const search = doc.getElementById("search");
    search.value = "  MAILLO ";
    search.dispatchEvent(new dom.window.Event("input", { bubbles: true }));

    const visible = [...doc.querySelectorAll(".row[data-name]:not(.nohit)")];
    expect(visible.length).toBeGreaterThan(0);
    for (const r of visible) expect(r.getAttribute("data-name")).toContain("maillo");
  });

  it("search and role filter combine", async () => {
    const dom = await loadLive("index.html");
    const doc = dom.window.document;
    // rakdisc appears as both Shadow (dps) and Discipline (healer)
    doc.querySelector('#filters button[data-role="healer"]').click();
    const search = doc.getElementById("search");
    search.value = "rakdisc";
    search.dispatchEvent(new dom.window.Event("input", { bubbles: true }));

    const visible = [...doc.querySelectorAll(".row[data-name]:not(.nohit)")];
    expect(visible.length).toBeGreaterThan(0);
    for (const r of visible) {
      expect(r.getAttribute("data-name")).toBe("rakdisc");
      expect(r.getAttribute("data-role")).toBe("healer");
    }
  });

  it("clearing the filter restores every row", async () => {
    const dom = await loadLive("index.html");
    const doc = dom.window.document;
    doc.querySelector('#filters button[data-role="tank"]').click();
    doc.querySelector('#filters button[data-role="all"]').click();
    expect(doc.querySelectorAll(".row.nohit, .sec.nohit").length).toBe(0);
  });
});

describe("filter persistence", () => {
  it("writes the active view to localStorage", async () => {
    const dom = await loadLive("index.html");
    const doc = dom.window.document;
    doc.querySelector('#filters button[data-role="healer"]').click();
    const search = doc.getElementById("search");
    search.value = "Heal";
    search.dispatchEvent(new dom.window.Event("input", { bubbles: true }));

    expect(dom.window.localStorage.getItem("gb.role")).toBe("healer");
    expect(dom.window.localStorage.getItem("gb.query")).toBe("heal");
  });

  it("restores a saved view on load", async () => {
    const dom = await loadLive("index.html", {
      localStorage: { "gb.role": "tank", "gb.query": "brew" },
    });
    const doc = dom.window.document;
    expect(doc.querySelector("#filters button.on").getAttribute("data-role")).toBe("tank");
    expect(doc.getElementById("search").value).toBe("brew");
    const visible = [...doc.querySelectorAll(".row[data-name]:not(.nohit)")];
    expect(visible.length).toBeGreaterThan(0);
    for (const r of visible) {
      expect(r.getAttribute("data-role")).toBe("tank");
      expect(r.getAttribute("data-name")).toContain("brew");
    }
  });
});

describe("week archive dropdown", () => {
  it("populates from the manifest and unhides, with no week selected on index", async () => {
    const dom = await loadLive("index.html", { weeks: ["2026-07-21", "2026-07-20"] });
    const sel = dom.window.document.getElementById("weeksel");
    expect(sel.hidden).toBe(false);
    expect([...sel.options].map(o => o.value)).toEqual(["", "2026-07-21", "2026-07-20"]);
    expect([...sel.options].map(o => o.textContent)).toEqual(
      ["This week", "Week of 2026-07-21", "Week of 2026-07-20"]);
    expect(sel.value).toBe("");
  });

  it("preselects the current week on an archive page", async () => {
    const dom = await loadLive("archive/2026-07-20.html", {
      weeks: ["2026-07-21", "2026-07-20"],
    });
    expect(dom.window.document.getElementById("weeksel").value).toBe("2026-07-20");
  });

  it("stays hidden and breaks nothing when the manifest fetch fails", async () => {
    const dom = await loadLive("index.html", { fetchFails: true });
    const doc = dom.window.document;
    expect(doc.getElementById("weeksel").hidden).toBe(true);
    // rest of the enhancement still works
    expect(doc.getElementById("filters").hidden).toBe(false);
  });

  it("stays hidden when the manifest is not a non-empty array", async () => {
    for (const weeks of [[], {}, "nope", null]) {
      const dom = await loadLive("index.html", { weeks });
      expect(dom.window.document.getElementById("weeksel").hidden).toBe(true);
    }
  });
});
