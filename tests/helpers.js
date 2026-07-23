import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

export function htmlPages() {
  const pages = [{ name: "index.html", path: join(ROOT, "index.html") }];
  for (const f of readdirSync(join(ROOT, "archive")).filter(f => f.endsWith(".html")).sort()) {
    pages.push({ name: `archive/${f}`, path: join(ROOT, "archive", f) });
  }
  return pages;
}

export function stateFiles() {
  return readdirSync(join(ROOT, "data"))
    .filter(f => /^\d{4}-\d{2}-\d{2}-state\.json$/.test(f))
    .sort()
    .map(f => ({
      date: f.slice(0, 10),
      path: join(ROOT, "data", f),
      state: JSON.parse(readFileSync(join(ROOT, "data", f), "utf8")),
    }));
}

export function parsePage(relPath) {
  const html = readFileSync(join(ROOT, relPath), "utf8");
  return new JSDOM(html);
}

/**
 * Load a page with its inline script actually running, the way a browser
 * would. The archive-manifest fetch is stubbed so tests control it.
 *
 * opts.weeks       — value the manifest fetch resolves to (default: real file)
 * opts.fetchFails  — reject the manifest fetch
 * opts.localStorage— seed key/values before the script runs
 */
export async function loadLive(relPath, opts = {}) {
  const html = readFileSync(join(ROOT, relPath), "utf8");
  const url = `http://guild.test/${relPath}`;
  const weeks = "weeks" in opts
    ? opts.weeks
    : JSON.parse(readFileSync(join(ROOT, "archive/index.json"), "utf8"));

  const dom = new JSDOM(html, {
    url,
    runScripts: "dangerously",
    beforeParse(window) {
      for (const [k, v] of Object.entries(opts.localStorage || {})) {
        window.localStorage.setItem(k, v);
      }
      window.fetch = () =>
        opts.fetchFails
          ? Promise.reject(new TypeError("network down"))
          : Promise.resolve({ ok: true, json: () => Promise.resolve(weeks) });
    },
  });
  // let the fetch().then() chain settle
  await new Promise(r => setTimeout(r, 0));
  await new Promise(r => setTimeout(r, 0));
  return dom;
}
