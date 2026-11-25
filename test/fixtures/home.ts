import { mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { bundlePlugin } from "@weivel/typescript/bundle";
import type { BoundDefinition } from "@weivel/typescript/host";
import { startHost, type RunningHost } from "@weivel/typescript/program";
import { describedLibrary, scratchHome, setVariables, type DescribedLibrary, type PlacedLibrary } from "@weivel/typescript/testing";

export const REPOSITORY = resolve(import.meta.dirname, "..", "..");
export const HOST_ID = "test-host";

const NATIVE = join(REPOSITORY, "native");

/** One plugin to install: its manifest, the bundled entry to place where the manifest names it, and its stored settings. */
export interface Install {
  readonly manifest: { readonly id: string; readonly version: string; readonly entry: string } & Record<string, unknown>;
  readonly bundle: string;
  readonly settings: Record<string, unknown>;
}

export interface Home {
  readonly base: string;
  readonly runtime: string;
  /** Puts the process's places back as they were and deletes the home. */
  remove(): void;
}

interface LaidOutHome {
  readonly variables: readonly { readonly name: string; readonly value: string }[];
}

let runtimeTesting: DescribedLibrary | undefined;

/** runtime-testing's service, the test-only C library that lays a home out through runtime's own writers, loaded once. */
function testingService(): BoundDefinition {
  runtimeTesting ??= describedLibrary(join(NATIVE, "runtime_testing"));
  return runtimeTesting.described.get("runtime.testing")!;
}

function hintedLibrary(id: string, placed: PlacedLibrary): Record<string, unknown> {
  return { id, version: null, directory: placed.directory, binary: placed.binary };
}

function layOutHome(base: string, libraries: Readonly<Record<string, PlacedLibrary>>, installs: readonly Install[]): Promise<LaidOutHome> {
  const argument = {
    base,
    host_id: HOST_ID,
    installs: installs.map((install) => ({ manifest: install.manifest, entry_source: install.bundle, settings: install.settings })),
    libraries: [hintedLibrary("runtime", libraries.runtime!), hintedLibrary("forebay-library", libraries.forebay_library!)],
    holder: process.pid,
  };
  return testingService().lay_out_home!({ argument }) as Promise<LaidOutHome>;
}

/**
 * Lays out a fresh home under the temporary directory through runtime-testing, as an install leaves one: the
 * registered loader `test-host`, the javascript-host's hint naming runtime and forebay-library, every install enabled,
 * and this process recorded as the loader's holder, so a SERVE run keeps running. The process's places point into it
 * until `remove`.
 */
export async function homeWith(installs: readonly Install[]): Promise<Home> {
  const scratch = scratchHome({
    prefix: "stub-home-",
    libraries: { runtime: join(NATIVE, "runtime"), forebay_library: join(NATIVE, "forebay_library") },
    environment: () => ({}),
    files: () => [],
  });
  try {
    const base = join(scratch.base, "home");
    mkdirSync(base);
    const laidOut = await layOutHome(base, scratch.libraries, installs);
    const restore = setVariables(Object.fromEntries(laidOut.variables.map((variable) => [variable.name, variable.value])));
    const remove = (): void => {
      restore();
      scratch.remove();
    };
    return { base, runtime: scratch.libraries.runtime!.binary, remove };
  } catch (error) {
    scratch.remove();
    throw error;
  }
}

/** Bundles a plugin entry into one module, as a plugin's build does, under `directory`. */
export function bundled(entry: string, directory: string): Promise<string> {
  return bundlePlugin(entry, directory);
}

/** The stub's own install: its manifest, its bundle, and settings laid over its defaults. */
export function stubInstall(bundle: string, settings: Record<string, unknown> = {}): Install {
  return { manifest: JSON.parse(readFileSync(join(REPOSITORY, "plugin.json"), "utf8")), bundle, settings };
}

/** Starts the host program over `home` with these arguments after the loader id, its log kept quiet. */
export function hostIn(home: Home, actionArguments: readonly string[] = []): Promise<RunningHost> {
  const quiet = (): void => undefined;
  return startHost({ hostLibraryPath: home.runtime, arguments: [HOST_ID, ...actionArguments], log: { debug: quiet, info: quiet, warn: quiet, error: quiet } });
}

/** Every line the loader's log files in `home` hold, readable once the run stopped and its writer wrote them. */
export function loggedIn(home: Home): string {
  const files = readdirSync(home.base, { recursive: true, encoding: "utf8" }).filter((file) => file.endsWith(".log"));
  return files.map((file) => readFileSync(join(home.base, file), "utf8")).join("\n");
}

let realPaths: Promise<readonly string[]> | undefined;

async function resolvedRealPlaces(): Promise<readonly string[]> {
  const environment = Object.entries(process.env).flatMap(([name, value]) => (value === undefined ? [] : [{ name, value }]));
  const answer = (await testingService().real_places!({ argument: { environment } })) as { paths: readonly string[] };
  return answer.paths;
}

/** The places runtime resolves for this user with no override, read once, at the first snapshot, before any home moves them. */
function realPlaces(): Promise<readonly string[]> {
  realPaths ??= resolvedRealPlaces();
  return realPaths;
}

function described(path: string): string {
  const status = statSync(path);
  return `${path} ${status.size} ${status.mtimeMs}`;
}

function filesAt(path: string): string[] {
  try {
    if (statSync(path).isFile()) return [described(path)];
    return readdirSync(path, { recursive: true, encoding: "utf8" }).map((file) => described(join(path, file)));
  } catch {
    return [];
  }
}

/** Every file in the real places, the secrets file among them, each with its size and modified time. */
export async function realPlacesSnapshot(): Promise<readonly string[]> {
  return [...new Set((await realPlaces()).flatMap(filesAt))].sort();
}
