// Sets the app's version everywhere it appears:  npm run version:set -- 0.2.0
import { readFileSync, writeFileSync } from "node:fs";

const version = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(version ?? "")) {
  console.error("Usage: npm run version:set -- <major.minor.patch>   e.g. 0.2.0");
  process.exit(1);
}

function edit(file, change) {
  const before = readFileSync(file, "utf8");
  const after = change(before);
  if (after === before) console.log(`${file}: already ${version}`);
  else {
    writeFileSync(file, after);
    console.log(`${file}: -> ${version}`);
  }
}

const json = (text) => text.replace(/("version":\s*")[^"]+(")/, `$1${version}$2`);

edit("package.json", json);
edit("src-tauri/tauri.conf.json", json);
// package-lock.json repeats the version for the project itself (first two occurrences)
edit("package-lock.json", (t) => {
  let n = 0;
  return t.replace(/("version":\s*")[^"]+(")/g, (m, a, b) => (n++ < 2 ? `${a}${version}${b}` : m));
});
edit("src-tauri/Cargo.toml", (t) => t.replace(/^version = ".*"$/m, `version = "${version}"`));
edit("backend/app/main.py", (t) => t.replace(/(version=")[^"]+(")/, `$1${version}$2`));

console.log(`\nNow rebuild (npm run backend:build, then npm run tauri build) and tag v${version}.`);
