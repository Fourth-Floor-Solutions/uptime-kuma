#!/usr/bin/env node
/**
 * Remove emoji and pictographic glyphs from text files in the repository.
 *
 * Fourth Floor fork policy: no emoji in the codebase. Upstream uses them in
 * UI strings, translations, docs and workflow files; this script strips them
 * so the rule holds after every upstream rebase (see .github/workflows/upstream-sync.yml).
 *
 * Rules:
 *  - emoji, pictographs, dingbats, variation selectors and ZWJ are deleted, together
 *    with one adjacent space so "X Down" does not become " Down";
 *  - arrows (U+2190-21FF) become "->" / "<-" / "<->" instead of vanishing;
 *  - only text files with known extensions are touched; build output, VCS data,
 *    dependencies and binary assets are skipped.
 *
 * Usage: node extra/strip-emoji.js [--check]   (--check exits 1 if anything would change)
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const CHECK = process.argv.includes("--check");
const SKIP_DIRS = new Set([ ".git", "node_modules", "dist", "dist-ssr", "data", "coverage", ".vite" ]);
const EXTS = new Set([ ".js", ".mjs", ".cjs", ".ts", ".vue", ".json", ".md", ".yml", ".yaml", ".html", ".scss", ".css", ".sh", ".txt", ".ejs", ".env" ]);
const SELF = path.join(ROOT, "extra", "strip-emoji.js");

// Emoji-ish code points. Deliberately excludes en/em dashes, quotes, bullets and box drawing.
const EMOJI = "[\\u{1F000}-\\u{1FAFF}\\u{2600}-\\u{27BF}\\u{2B00}-\\u{2BFF}\\u{2300}-\\u{23FF}]";
const EMOJI_RUN = new RegExp(`${EMOJI}+`, "gu");
// Variation selector, zero-width joiner and keycap combiner: removed on their own first,
// so that sequences like "\u2764\uFE0F" collapse to a single pictograph before the run pass.
const JOINERS = /\u{FE0F}|\u{200D}|\u{20E3}/gu;
const ARROWS = [
    [ /[\u2194\u21D4]/g, "<->" ],
    [ /[\u2190\u21D0\u21E0]/g, "<-" ],
    [ /[\u2192\u21D2\u21E2\u27A1\u2B95]/g, "->" ],
    [ /[\u2191\u2193\u21D1\u21D3\u2195]/g, "" ],
];
// JSON-escaped surrogate pairs for U+1F000-1FAFF (\ud83c-\ud83e + \udc00-\udfff), e.g. "💡"
const ESCAPED = /\\ud83[c-e]\\ud[c-f][0-9a-f]{2}(\\ufe0f)?/gi;

/**
 * Strip emoji from one string.
 * @param {string} s input text
 * @returns {string} cleaned text
 */
function clean(s) {
    let out = s.replace(ESCAPED, "").replace(JOINERS, "");
    for (const [ re, rep ] of ARROWS) {
        out = out.replace(re, rep);
    }
    // Delete each emoji run plus one neighbouring space, preferring the space after it.
    out = out.replace(new RegExp(`( ?)${EMOJI}+( ?)`, "gu"), (m, before, after) => {
        return (before && after) ? " " : "";
    });
    // A regex literal that contained only an emoji is now an empty "//" (a comment).
    // The only upstream instance is `msg.replace(/X/, "Y")`; with both sides stripped the
    // call is a no-op, so drop it rather than leave a syntax error behind.
    out = out.replace(/\.replace\(\/\/,\s*""\)/g, "");
    return out;
}

/**
 * Walk the tree and yield candidate files.
 * @param {string} dir directory to walk
 * @param {string[]} acc accumulator
 * @returns {string[]} file paths
 */
function walk(dir, acc = []) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (!SKIP_DIRS.has(entry.name)) {
                walk(full, acc);
            }
        } else if (entry.isFile() && EXTS.has(path.extname(entry.name)) && full !== SELF) {
            acc.push(full);
        }
    }
    return acc;
}

let changed = 0;
for (const file of walk(ROOT)) {
    const src = fs.readFileSync(file, "utf8");
    if (!EMOJI_RUN.test(src) && !ESCAPED.test(src) && !JOINERS.test(src) && !ARROWS.some(([ re ]) => re.test(src))) {
        EMOJI_RUN.lastIndex = 0;
        ESCAPED.lastIndex = 0;
        JOINERS.lastIndex = 0;
        continue;
    }
    EMOJI_RUN.lastIndex = 0;
    ESCAPED.lastIndex = 0;
    JOINERS.lastIndex = 0;
    const out = clean(src);
    if (out !== src) {
        changed++;
        console.log((CHECK ? "would change " : "cleaned ") + path.relative(ROOT, file));
        if (!CHECK) {
            fs.writeFileSync(file, out, "utf8");
        }
    }
}
console.log(`${CHECK ? "files needing changes" : "files changed"}: ${changed}`);
if (CHECK && changed > 0) {
    process.exit(1);
}
