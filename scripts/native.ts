import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

interface NativeLibrary {
  readonly sibling: string;
  readonly target: string;
  readonly declaration: string;
}

const REPOSITORY_ROOT = resolve(import.meta.dirname, "..");
const SIBLINGS = join(REPOSITORY_ROOT, "siblings");
const NATIVE = join(REPOSITORY_ROOT, "native");
const LIBRARIES: readonly NativeLibrary[] = [
  { sibling: "forebay-library", target: "forebay_library", declaration: "library.json" },
  { sibling: "library", target: "runtime", declaration: join("runtime", "library.json") },
  { sibling: "library", target: "runtime_testing", declaration: join("runtime", "testing", "library.json") },
];

function sharedLibraryFileName(target: string): string {
  if (process.platform === "win32") return `${target}.dll`;
  return process.platform === "darwin" ? `lib${target}.dylib` : `lib${target}.so`;
}

function cmake(cmakeArguments: readonly string[]): void {
  execFileSync("cmake", cmakeArguments, { stdio: "inherit" });
}

/**
 * The configure arguments that put every binary of a build directly in `bin`, on every system.
 * @implNote MSVC appends the configuration to a plain output directory, so the `_RELEASE` variants are set as well.
 */
function outputArguments(bin: string): string[] {
  return ["LIBRARY", "RUNTIME", "ARCHIVE"].flatMap((kind) => [`-DCMAKE_${kind}_OUTPUT_DIRECTORY=${bin}`, `-DCMAKE_${kind}_OUTPUT_DIRECTORY_RELEASE=${bin}`]);
}

function built(library: NativeLibrary): void {
  const source = join(SIBLINGS, library.sibling);
  if (!existsSync(join(source, "CMakeLists.txt"))) throw new Error(`siblings/${library.sibling} is missing: check out what repo.json pins there`);
  const build = join(source, "build");
  const bin = join(build, "bin");
  cmake(["-S", source, "-B", build, "-DCMAKE_BUILD_TYPE=Release", ...outputArguments(bin)]);
  cmake(["--build", build, "--config", "Release", "--target", library.target]);
  const fileName = sharedLibraryFileName(library.target);
  const binary = join(bin, fileName);
  if (!existsSync(binary)) throw new Error(`the build of ${library.sibling} left no ${fileName} in ${bin}`);
  const destination = join(NATIVE, library.target);
  mkdirSync(destination, { recursive: true });
  copyFileSync(binary, join(destination, fileName));
  copyFileSync(join(source, library.declaration), join(destination, "library.json"));
}

LIBRARIES.forEach(built);
