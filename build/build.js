#!/usr/bin/env node
"use strict";

// Packages the single source tree in the repo root into a per-browser build under dist/.
// Chrome and Edge ship the exact same MV3 package (Edge Add-ons accepts Chrome extensions
// unmodified); Firefox gets a manifest override (background script style + a Gecko add-on id)
// merged over the base manifest.json, then handed to Mozilla's own `web-ext build`, which
// lints it against AMO's rules and produces the artifact AMO expects.
// Safari isn't built here - it's a native Xcode wrapper, scaffolded separately via
// `npm run build:safari-project` (see README "Building for other browsers").

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const DIST = path.join(ROOT, "dist");

// Everything the extension actually needs at runtime - deliberately excludes repo-only
// files like README.md, LICENSE, Media/, .claude/, this build/ folder, etc.
const SHARED_ENTRIES = ["background.js", "installed.html", "images", "scripts"];

const TARGETS = {
    chrome: { manifestOverride: null },
    edge: { manifestOverride: null },
    firefox: { manifestOverride: "manifest.firefox.json" }
};

function copyRecursive(src, dest) {
    const stat = fs.statSync(src);
    if (stat.isDirectory()) {
        fs.mkdirSync(dest, { recursive: true });
        fs.readdirSync(src).forEach(function (entry) {
            copyRecursive(path.join(src, entry), path.join(dest, entry));
        });
    } else {
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.copyFileSync(src, dest);
    }
}

function buildManifest(target) {
    const base = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));
    const overrideFile = TARGETS[target].manifestOverride;
    if (!overrideFile) return base;
    const override = JSON.parse(fs.readFileSync(path.join(ROOT, overrideFile), "utf8"));
    return Object.assign({}, base, override);
}

function build(target) {
    if (!TARGETS[target]) {
        console.error('Unknown target "' + target + '". Use one of: ' + Object.keys(TARGETS).join(", "));
        process.exit(1);
    }

    const outDir = path.join(DIST, target);
    fs.rmSync(outDir, { recursive: true, force: true });
    fs.mkdirSync(outDir, { recursive: true });

    SHARED_ENTRIES.forEach(function (entry) {
        copyRecursive(path.join(ROOT, entry), path.join(outDir, entry));
    });

    const manifest = buildManifest(target);
    fs.writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 4) + "\n");

    console.log("Built " + target + " -> " + path.relative(ROOT, outDir));

    if (target === "firefox") {
        const artifactsDir = path.join(DIST, "firefox-artifacts");
        execSync(
            "npx web-ext build --source-dir \"" + outDir + "\" --artifacts-dir \"" + artifactsDir + "\" --overwrite-dest",
            { stdio: "inherit", cwd: ROOT }
        );
    } else {
        const zipPath = path.join(DIST, "frsh-priceview-" + target + "-" + manifest.version + ".zip");
        if (fs.existsSync(zipPath)) fs.rmSync(zipPath);
        execSync("cd \"" + outDir + "\" && zip -r -X \"" + zipPath + "\" . -x '.*'", { stdio: "inherit" });
        console.log("Zipped -> " + path.relative(ROOT, zipPath));
    }
}

const requestedTarget = process.argv[2];
if (requestedTarget) {
    build(requestedTarget);
} else {
    Object.keys(TARGETS).forEach(build);
}
