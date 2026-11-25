import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { placesSnapshot } from "./fixtures/home.js";

const LATER = new Date(Date.UTC(2030, 0, 1));

let place: string;

function written(relative: string, text: string): void {
  const path = join(place, relative);
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, text);
}

beforeEach(() => {
  place = mkdtempSync(join(tmpdir(), "real-places-"));
  written(join("state", "accounts.json"), "{}");
  written(join("state", "logs", "2026-11-25", "host-10-00-00.log"), "started");
});

afterEach(() => rmSync(place, { recursive: true, force: true }));

describe("the snapshot of the real places, over a place of the test's own", () => {
  it("reads a file rewritten with the same bytes and a later modified time as unchanged", () => {
    const before = placesSnapshot([place]);
    written(join("state", "accounts.json"), "{}");
    utimesSync(join(place, "state", "accounts.json"), LATER, LATER);
    utimesSync(join(place, "state"), LATER, LATER);

    expect(placesSnapshot([place])).toEqual(before);
  });

  it("reads what every live run writes, its logs, process records and locks, as unchanged", () => {
    const before = placesSnapshot([place]);
    written(join("state", "logs", "2026-11-25", "host-10-00-00.log"), "started and served");
    written(join("state", "logs", "2026-11-25", "host-11-00-00.log"), "started");
    written(join("state", "processes", "test-host.json"), "{\"pid\":1}");
    written(join("state", ".settings.lock"), "");

    expect(placesSnapshot([place])).toEqual(before);
  });

  it("sees a file whose bytes changed, though its size did not", () => {
    const before = placesSnapshot([place]);
    written(join("state", "accounts.json"), "[]");

    expect(placesSnapshot([place])).not.toEqual(before);
  });

  it("sees a file or a folder that appeared", () => {
    const before = placesSnapshot([place]);
    mkdirSync(join(place, "cache"));
    const withFolder = placesSnapshot([place]);
    written(join("cache", "bundles", "plugin.js"), "export default {}");

    expect(withFolder).not.toEqual(before);
    expect(placesSnapshot([place])).not.toEqual(withFolder);
  });
});
