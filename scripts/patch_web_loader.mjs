#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const targetArg = process.argv[2] ?? "public/index.html";
const targetPath = path.resolve(process.cwd(), targetArg);

if (!fs.existsSync(targetPath)) {
  console.error(`patch_web_loader: file not found: ${targetPath}`);
  process.exit(1);
}

let html = fs.readFileSync(targetPath, "utf8");

const loaderCss = `<style>
html, body, #canvas {
	margin: 0;
	padding: 0;
	border: 0;
}

body {
	color: #8efaaa;
	background: radial-gradient(1200px 700px at 50% 35%, #0a2415 0%, #05140d 50%, #020b07 100%);
	overflow: hidden;
	touch-action: none;
	font-family: "Menlo", "Monaco", "Consolas", "Courier New", monospace;
}

#canvas {
	display: block;
}

#canvas:focus {
	outline: none;
}

#status {
	position: absolute;
	inset: 0;
	display: flex;
	justify-content: center;
	align-items: center;
	visibility: hidden;
	backdrop-filter: blur(2px);
}

#status-card {
	width: min(560px, 88vw);
	padding: 24px 24px 18px;
	border: 2px solid rgba(91, 226, 125, 0.85);
	border-radius: 20px;
	background: linear-gradient(180deg, rgba(3, 20, 13, 0.92), rgba(1, 12, 8, 0.96));
	box-shadow:
		0 18px 60px rgba(0, 0, 0, 0.45),
		0 0 56px rgba(91, 226, 125, 0.18),
		inset 0 0 20px rgba(91, 226, 125, 0.07);
}

#status-topline {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	margin-bottom: 10px;
}

#status-brand {
	font-size: clamp(34px, 5vw, 48px);
	line-height: 1.1;
	font-weight: 700;
	color: #c8ffd2;
	text-shadow: 0 0 20px rgba(142, 250, 170, 0.35);
}

#status-subtitle {
	font-size: clamp(14px, 2vw, 18px);
	color: #6bcf88;
	opacity: 0.9;
}

#status-pixels {
	display: grid;
	grid-template-columns: repeat(3, 12px);
	gap: 5px;
}

#status-pixels span {
	width: 12px;
	height: 12px;
	border: 2px solid #5be27d;
	background: rgba(91, 226, 125, 0.15);
	animation: nodokuPulse 1.2s ease-in-out infinite;
}

#status-pixels span:nth-child(2) { animation-delay: .15s; }
#status-pixels span:nth-child(3) { animation-delay: .30s; }

#status-progress, #status-notice {
	display: none;
}

#status-progress {
	width: 100%;
	height: 14px;
	appearance: none;
	border: 1px solid rgba(91, 226, 125, 0.75);
	border-radius: 10px;
	background: rgba(4, 23, 14, 0.8);
	overflow: hidden;
	margin-top: 12px;
}

#status-progress::-webkit-progress-bar {
	background: rgba(4, 23, 14, 0.8);
}

#status-progress::-webkit-progress-value {
	background: linear-gradient(90deg, #49bc66, #8efaaa);
}

#status-progress::-moz-progress-bar {
	background: linear-gradient(90deg, #49bc66, #8efaaa);
}

#status-notice {
	margin-top: 14px;
	background: rgba(76, 16, 16, 0.62);
	border: 1px solid rgba(255, 120, 120, 0.68);
	border-radius: 10px;
	color: #ffd7d7;
	line-height: 1.35;
	padding: 10px 12px;
	text-align: left;
	white-space: pre-line;
}

@keyframes nodokuPulse {
	0%, 100% { transform: scale(1.0); opacity: 0.45; }
	50% { transform: scale(1.08); opacity: 1; }
}
</style>`;

const loaderStatusHtml = `<div id="status">
			<div id="status-card">
				<div id="status-topline">
					<div>
						<div id="status-brand">Nodoku</div>
						<div id="status-subtitle">Connect all nodes</div>
					</div>
					<div id="status-pixels" aria-hidden="true">
						<span></span><span></span><span></span>
					</div>
				</div>
				<progress id="status-progress"></progress>
				<div id="status-notice"></div>
			</div>
			</div>`;

const perfTelemetryScript = `<script>
	(function () {
		if (window.__nodokuPerf) return;
		const MAX_FRAME_SAMPLES = 600;
		const LONGTASK_WINDOW_MS = 60 * 1000;
		const BATTERY_WINDOW_MS = 60 * 60 * 1000;
		const BATTERY_MIN_SPAN_MS = 2 * 60 * 1000;
		const frameSamples = [];
		const longTasks = [];
		const batterySamples = [];
		const timeOrigin = (performance && performance.timeOrigin) ? performance.timeOrigin : (Date.now() - performance.now());
		let enabled = false;
		let rafId = 0;
		let lastTs = 0;
		let longTaskObserver = null;
		let batteryRef = null;
		let batteryBound = false;

		function nowMs() { return Date.now(); }
		function toFinite(v) { return Number.isFinite(v) ? v : null; }
		function mean(values) {
			if (!values.length) return null;
			let sum = 0;
			for (const value of values) sum += value;
			return sum / values.length;
		}
		function percentile(values, p) {
			if (!values.length) return null;
			const sorted = [...values].sort((a, b) => a - b);
			if (sorted.length === 1) return sorted[0];
			const rank = Math.max(0, Math.min(sorted.length - 1, (p / 100) * (sorted.length - 1)));
			const lo = Math.floor(rank);
			const hi = Math.ceil(rank);
			if (lo === hi) return sorted[lo];
			const t = rank - lo;
			return sorted[lo] * (1 - t) + sorted[hi] * t;
		}
		function pruneByAge(list, maxAgeMs) {
			const cutoff = nowMs() - maxAgeMs;
			while (list.length && list[0].t < cutoff) list.shift();
		}
		function frameTick(ts) {
			if (!enabled) {
				rafId = 0;
				lastTs = 0;
				return;
			}
			if (lastTs > 0) {
				const dt = ts - lastTs;
				if (Number.isFinite(dt) && dt > 0 && dt < 1000) {
					frameSamples.push(dt);
					if (frameSamples.length > MAX_FRAME_SAMPLES) frameSamples.shift();
				}
			}
			lastTs = ts;
			rafId = window.requestAnimationFrame(frameTick);
		}
		function ensureFrameLoop() {
			if (rafId) return;
			lastTs = 0;
			rafId = window.requestAnimationFrame(frameTick);
		}
		function stopFrameLoop() {
			if (!rafId) return;
			window.cancelAnimationFrame(rafId);
			rafId = 0;
			lastTs = 0;
		}
		function ensureLongTaskObserver() {
			if (longTaskObserver || typeof PerformanceObserver === "undefined") return;
			try {
				longTaskObserver = new PerformanceObserver((list) => {
					if (!enabled) return;
					for (const entry of list.getEntries()) {
						const startEpoch = timeOrigin + entry.startTime;
						longTasks.push({
							t: Number.isFinite(startEpoch) ? startEpoch : nowMs(),
							duration: Number.isFinite(entry.duration) ? entry.duration : 0
						});
					}
					pruneByAge(longTasks, LONGTASK_WINDOW_MS);
				});
				longTaskObserver.observe({ type: "longtask", buffered: true });
			} catch (_) {
				longTaskObserver = null;
			}
		}
		function stopLongTaskObserver() {
			if (!longTaskObserver) return;
			try { longTaskObserver.disconnect(); } catch (_) {}
			longTaskObserver = null;
		}
		function pushBatterySample() {
			if (!batteryRef || typeof batteryRef.level !== "number") return;
			batterySamples.push({
				t: nowMs(),
				levelPct: batteryRef.level * 100,
				charging: !!batteryRef.charging
			});
			pruneByAge(batterySamples, BATTERY_WINDOW_MS);
		}
		function bindBatteryListeners() {
			if (!batteryRef || batteryBound) return;
			batteryBound = true;
			const handler = () => pushBatterySample();
			batteryRef.addEventListener("levelchange", handler);
			batteryRef.addEventListener("chargingchange", handler);
			batteryRef.addEventListener("chargingtimechange", handler);
			batteryRef.addEventListener("dischargingtimechange", handler);
			pushBatterySample();
		}
		async function ensureBattery() {
			if (batteryRef || !navigator.getBattery) return;
			try {
				batteryRef = await navigator.getBattery();
				bindBatteryListeners();
			} catch (_) {
				batteryRef = null;
			}
		}
		function calcBatteryDrainPerHour() {
			if (!batterySamples.length) return null;
			const discharging = batterySamples.filter((s) => !s.charging);
			if (discharging.length < 2) return null;
			const first = discharging[0];
			const last = discharging[discharging.length - 1];
			const dt = last.t - first.t;
			if (dt < BATTERY_MIN_SPAN_MS) return null;
			const delta = first.levelPct - last.levelPct;
			if (!Number.isFinite(delta) || delta <= 0) return 0;
			return delta / (dt / (60 * 60 * 1000));
		}
		function snapshot() {
			if (enabled) pushBatterySample();
			pruneByAge(longTasks, LONGTASK_WINDOW_MS);
			pruneByAge(batterySamples, BATTERY_WINDOW_MS);
			let longTaskDuration = 0;
			for (const item of longTasks) longTaskDuration += item.duration;
			const heapSupported = !!(performance && performance.memory && Number.isFinite(performance.memory.usedJSHeapSize));
			const heap = heapSupported ? {
				used_mb: performance.memory.usedJSHeapSize / (1024 * 1024),
				total_mb: performance.memory.totalJSHeapSize / (1024 * 1024),
				limit_mb: performance.memory.jsHeapSizeLimit / (1024 * 1024)
			} : null;
			const batterySupported = !!navigator.getBattery;
			const battery = batterySupported ? {
				level_pct: batteryRef && Number.isFinite(batteryRef.level) ? batteryRef.level * 100 : null,
				charging: batteryRef ? !!batteryRef.charging : null,
				discharging_rate_pct_per_hour: calcBatteryDrainPerHour()
			} : null;
			return {
				version: 1,
				enabled,
				timestamp_ms: nowMs(),
				supported: {
					longtask: typeof PerformanceObserver !== "undefined",
					heap: heapSupported,
					battery: batterySupported
				},
				frame: {
					count: frameSamples.length,
					avg_ms: toFinite(mean(frameSamples)),
					p50_ms: toFinite(percentile(frameSamples, 50)),
					p95_ms: toFinite(percentile(frameSamples, 95))
				},
				longtask: {
					count_60s: longTasks.length,
					duration_ms_60s: toFinite(longTaskDuration) || 0
				},
				heap,
				battery
			};
		}
		function reset() {
			frameSamples.length = 0;
			longTasks.length = 0;
			batterySamples.length = 0;
			lastTs = 0;
			pushBatterySample();
		}
		function setEnabled(flag) {
			const target = !!flag;
			if (enabled === target) return enabled;
			enabled = target;
			if (enabled) {
				ensureFrameLoop();
				ensureLongTaskObserver();
				ensureBattery();
			} else {
				stopFrameLoop();
				stopLongTaskObserver();
			}
			return enabled;
		}
		window.__nodokuPerf = {
			snapshot,
			snapshotJSON() {
				try { return JSON.stringify(snapshot()); } catch (_) { return "{}"; }
			},
			reset,
			setEnabled,
			isEnabled() { return enabled; }
		};
	}());
</script>`;

html = html.replace(/<title>[\s\S]*?<\/title>/, "<title>Nodoku</title>");

const firstStyleRegex = /<style>[\s\S]*?<\/style>/;
if (!firstStyleRegex.test(html)) {
  console.error("patch_web_loader: could not locate base <style> block");
  process.exit(1);
}
html = html.replace(firstStyleRegex, loaderCss);

html = html.replace(/background:#F4F1EC;/g, "background:#020b07;");

const statusBlockRegex = /<div id="status">[\s\S]*?<script src="index\.js"><\/script>/;
if (!statusBlockRegex.test(html)) {
  console.error("patch_web_loader: could not locate #status block");
  process.exit(1);
}
html = html.replace(
  statusBlockRegex,
  `${loaderStatusHtml}\n\n\t\t<script src="index.js"></script>`
);

if (!html.includes("window.__nodokuPerf")) {
  html = html.replace("</head>", `${perfTelemetryScript}\n\t</head>`);
}

fs.writeFileSync(targetPath, html, "utf8");
console.log(`patch_web_loader: patched ${targetPath}`);
