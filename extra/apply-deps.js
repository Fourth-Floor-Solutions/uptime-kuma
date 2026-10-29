#!/usr/bin/env node
/**
 * Apply the fork's dependency pins (extra/deps-pins.json) to package.json, refresh the
 * lockfile, and let `npm audit fix` raise transitive packages within their allowed ranges.
 *
 * The result is committed as a single "[deps-audit]" commit that the upstream-sync workflow
 * drops before rebasing and re-creates afterwards, so it never conflicts with upstream.
 *
 * Usage: node extra/apply-deps.js            apply pins + refresh lockfile
 *        node extra/apply-deps.js --check    exit 1 if package.json does not match the pins
 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const pins = JSON.parse(fs.readFileSync(path.join(ROOT, "extra", "deps-pins.json"), "utf8"));
const pkgPath = path.join(ROOT, "package.json");
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
const check = process.argv.includes("--check");

let changed = [];
for (const section of [ "dependencies", "devDependencies" ]) {
    for (const [ name, version ] of Object.entries(pins[section] || {})) {
        const current = (pkg[section] || {})[name];
        if (current === undefined) {
            console.warn(`warning: ${name} is not in ${section}; skipping`);
            continue;
        }
        if (current !== version) {
            changed.push(`${name} ${current} -> ${version}`);
            pkg[section][name] = version;
        }
    }
}

if (check) {
    changed.forEach((c) => console.log("pin not applied: " + c));
    process.exit(changed.length ? 1 : 0);
}

if (changed.length) {
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 4) + "\n");
    console.log("package.json: " + changed.join(", "));
} else {
    console.log("package.json already matches the pins");
}

const run = (cmd) => {
    console.log("> " + cmd);
    execSync(cmd, { cwd: ROOT, stdio: "inherit" });
};
run("npm install --package-lock-only --no-audit --no-fund --ignore-scripts");
// Non-breaking bumps of transitive packages only; never touches package.json.
try {
    run("npm audit fix --package-lock-only --no-fund --ignore-scripts");
} catch (e) {
    console.log("npm audit fix left some advisories unresolved (expected when only breaking fixes remain)");
}
