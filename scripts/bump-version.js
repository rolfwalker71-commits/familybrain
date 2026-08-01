#!/usr/bin/env node
/**
 * Writes lib/app-version.ts as YYYYMMDD-HHMM (local time).
 * Run before commits: `npm run version:bump` (no pre-commit hook required).
 */
const fs = require("fs");
const path = require("path");

const now = new Date();
const pad = (n) => String(n).padStart(2, "0");
const version = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;

const target = path.join(__dirname, "..", "lib", "app-version.ts");
const contents = `/** Sidebar build stamp (YYYYMMDD-HHMM). Bump with \`npm run version:bump\` before each commit. */\nexport const APP_VERSION = "${version}";\n`;

fs.writeFileSync(target, contents, "utf8");
process.stdout.write(version + "\n");
