#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const defaultFrom = path.join(rootDir, "config", "vfx_release_candidate.json");
const defaultTo = path.join(rootDir, "config", "vfx_defaults.json");

function usage() {
	console.log(
		"Usage: node scripts/promote_vfx_defaults.mjs [--from <json>] [--to <json>]\n" +
		"Defaults:\n" +
		`  --from ${defaultFrom}\n` +
		`  --to   ${defaultTo}`
	);
}

function parseArgs(argv) {
	const out = { from: defaultFrom, to: defaultTo };
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === "--help" || arg === "-h") {
			usage();
			process.exit(0);
		}
		if (arg === "--from") {
			if (i + 1 >= argv.length) {
				throw new Error("Missing value for --from");
			}
			out.from = path.resolve(process.cwd(), argv[++i]);
			continue;
		}
		if (arg === "--to") {
			if (i + 1 >= argv.length) {
				throw new Error("Missing value for --to");
			}
			out.to = path.resolve(process.cwd(), argv[++i]);
			continue;
		}
		throw new Error(`Unknown argument: ${arg}`);
	}
	return out;
}

function isObject(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertObject(value, label) {
	if (!isObject(value)) {
		throw new Error(`${label} must be an object`);
	}
}

function assertFiniteNumber(value, label) {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		throw new Error(`${label} must be a finite number`);
	}
}

function validateEffectProfiles(profiles, label) {
	assertObject(profiles, label);
	for (const [key, value] of Object.entries(profiles)) {
		assertObject(value, `${label}.${key}`);
		if ("intensity" in value) {
			assertFiniteNumber(value.intensity, `${label}.${key}.intensity`);
		}
		if ("motion" in value) {
			assertFiniteNumber(value.motion, `${label}.${key}.motion`);
		}
	}
}

function validateVfxProfileShape(payload) {
	assertObject(payload, "root");
	assertObject(payload.gameplay, "gameplay");
	assertObject(payload.post, "post");
	validateEffectProfiles(payload.gameplay.profiles, "gameplay.profiles");
	validateEffectProfiles(payload.post.profiles, "post.profiles");
}

function normalizeReleaseProfile(payload) {
	const normalized = JSON.parse(JSON.stringify(payload));
	normalized.version = 1;
	normalized.developer_mode = false;
	return normalized;
}

function readJson(filePath) {
	if (!fs.existsSync(filePath)) {
		throw new Error(`Input file not found: ${filePath}`);
	}
	const raw = fs.readFileSync(filePath, "utf8");
	try {
		return JSON.parse(raw);
	} catch (error) {
		throw new Error(`Invalid JSON in ${filePath}: ${error.message}`);
	}
}

function writeJson(filePath, data) {
	fs.mkdirSync(path.dirname(filePath), { recursive: true });
	fs.writeFileSync(filePath, `${JSON.stringify(data, null, "\t")}\n`, "utf8");
}

function main() {
	const { from, to } = parseArgs(process.argv.slice(2));
	const input = readJson(from);
	validateVfxProfileShape(input);
	const normalized = normalizeReleaseProfile(input);
	writeJson(to, normalized);
	console.log(`Promoted VFX defaults:\n  from: ${from}\n  to:   ${to}`);
}

try {
	main();
} catch (error) {
	console.error(`[promote_vfx_defaults] ${error.message}`);
	process.exit(1);
}
