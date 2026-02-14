import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const ROOT = process.cwd();
const ICON_ROOT = path.join(ROOT, "assets", "app_icons");

const DEFAULT_MASTER = path.join(
  ROOT,
  "assets",
  "app_icons",
  "source",
  "master-approved-1024.png",
);
const FALLBACK_MASTER = path.join(
  ROOT,
  "output",
  "icon-preview",
  "idea8-redonly",
  "style1",
  "shot-0.png",
);
const FALLBACK_MASTER_2 = path.join(
  ROOT,
  "output",
  "icon-preview",
  "idea8-redonly",
  "style0",
  "shot-0.png",
);

const SIZE = 1024;

function parseArgs(argv) {
  const args = {
    master: "",
    bg: "",
  };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--master" && next) {
      args.master = next;
      i++;
      continue;
    }
    if (arg === "--bg" && next) {
      args.bg = next;
      i++;
      continue;
    }
  }
  return args;
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function resolveInputMaster(rawPath) {
  if (!rawPath) {
    return "";
  }
  return path.isAbsolute(rawPath) ? rawPath : path.resolve(ROOT, rawPath);
}

function parseHexColor(hex) {
  const token = String(hex || "").trim();
  const m = /^#?([0-9a-fA-F]{6})$/.exec(token);
  if (!m) {
    return null;
  }
  const value = m[1];
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  };
}

function rgbToHex(rgb) {
  const to2 = (v) => v.toString(16).padStart(2, "0");
  return `#${to2(rgb.r)}${to2(rgb.g)}${to2(rgb.b)}`;
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function normalizeMasterTo1024(inputPath) {
  return sharp(inputPath)
    .resize(SIZE, SIZE, { fit: "cover", position: "center" })
    .flatten()
    .png({ compressionLevel: 9 })
    .toBuffer();
}

async function resizeFromBuffer(inputBuffer, outputPath, size) {
  await sharp(inputBuffer)
    .resize(size, size, { fit: "cover" })
    .png({ compressionLevel: 9 })
    .toFile(outputPath);
}

async function sampleCornerBackgroundColor(inputBuffer) {
  const { data, info } = await sharp(inputBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const coords = [
    [0, 0],
    [info.width - 1, 0],
    [0, info.height - 1],
    [info.width - 1, info.height - 1],
  ];

  let rSum = 0;
  let gSum = 0;
  let bSum = 0;
  for (const [x, y] of coords) {
    const idx = (y * info.width + x) * info.channels;
    rSum += data[idx];
    gSum += data[idx + 1];
    bSum += data[idx + 2];
  }
  return {
    r: Math.round(rSum / coords.length),
    g: Math.round(gSum / coords.length),
    b: Math.round(bSum / coords.length),
  };
}

async function writeAdaptiveBackground(outputPath, size, color) {
  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: {
        r: color.r,
        g: color.g,
        b: color.b,
        alpha: 1,
      },
    },
  })
    .png({ compressionLevel: 9 })
    .toFile(outputPath);
}

async function writeAdaptiveMonochrome(masterBuffer, outputPath, bgColor) {
  const { data, info } = await sharp(masterBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const out = Buffer.alloc(info.width * info.height * 4);
  const threshold = 26;

  for (let i = 0; i < info.width * info.height; i++) {
    const src = i * info.channels;
    const dst = i * 4;
    const dr = Math.abs(data[src] - bgColor.r);
    const dg = Math.abs(data[src + 1] - bgColor.g);
    const db = Math.abs(data[src + 2] - bgColor.b);
    const delta = dr + dg + db;
    const alpha = delta > threshold ? 255 : 0;
    out[dst] = 0;
    out[dst + 1] = 0;
    out[dst + 2] = 0;
    out[dst + 3] = alpha;
  }

  await sharp(out, {
    raw: {
      width: info.width,
      height: info.height,
      channels: 4,
    },
  })
    .resize(432, 432, { fit: "cover" })
    .png({ compressionLevel: 9 })
    .toFile(outputPath);
}

async function pickMasterPath(argMaster) {
  const candidate = resolveInputMaster(argMaster);
  if (candidate && (await exists(candidate))) {
    return candidate;
  }
  if (!argMaster && (await exists(DEFAULT_MASTER))) {
    return DEFAULT_MASTER;
  }
  if (!argMaster && (await exists(FALLBACK_MASTER))) {
    return FALLBACK_MASTER;
  }
  if (!argMaster && (await exists(FALLBACK_MASTER_2))) {
    return FALLBACK_MASTER_2;
  }
  if (argMaster) {
    throw new Error(`Master image not found: ${candidate}`);
  }
  throw new Error(
    [
      "No master icon found.",
      `Expected: ${DEFAULT_MASTER}`,
      `or: ${FALLBACK_MASTER}`,
      `or: ${FALLBACK_MASTER_2}`,
      "Pass one explicitly with --master <path>.",
    ].join("\n"),
  );
}

async function main() {
  const args = parseArgs(process.argv);
  const masterPath = await pickMasterPath(args.master);
  const masterBuffer = await normalizeMasterTo1024(masterPath);

  const paths = {
    source: path.join(ICON_ROOT, "source"),
    ios: path.join(ICON_ROOT, "ios"),
    android: path.join(ICON_ROOT, "android"),
    web: path.join(ICON_ROOT, "web"),
    public: path.join(ROOT, "public"),
  };
  await Promise.all(Object.values(paths).map((dir) => ensureDir(dir)));

  const sourcePngPath = path.join(paths.source, "master-1024.png");
  const sourceRefPath = path.join(paths.source, "master.source.txt");
  await fs.writeFile(sourcePngPath, masterBuffer);
  await fs.writeFile(sourceRefPath, `${path.relative(ROOT, masterPath)}\n`);

  const bgFromArg = parseHexColor(args.bg);
  const bgColor = bgFromArg || (await sampleCornerBackgroundColor(masterBuffer));

  await Promise.all([
    resizeFromBuffer(masterBuffer, path.join(paths.ios, "icon_1024x1024.png"), 1024),
    resizeFromBuffer(masterBuffer, path.join(paths.ios, "app_store_1024x1024.png"), 1024),
    resizeFromBuffer(masterBuffer, path.join(paths.android, "main_192x192.png"), 192),
    resizeFromBuffer(masterBuffer, path.join(paths.android, "adaptive_foreground_432x432.png"), 432),
    resizeFromBuffer(masterBuffer, path.join(paths.web, "icon_128x128.png"), 128),
    resizeFromBuffer(masterBuffer, path.join(paths.web, "apple_touch_180x180.png"), 180),
    resizeFromBuffer(masterBuffer, path.join(paths.web, "pwa_144x144.png"), 144),
    resizeFromBuffer(masterBuffer, path.join(paths.web, "pwa_180x180.png"), 180),
    resizeFromBuffer(masterBuffer, path.join(paths.web, "pwa_512x512.png"), 512),
  ]);

  await writeAdaptiveBackground(
    path.join(paths.android, "adaptive_background_432x432.png"),
    432,
    bgColor,
  );
  await writeAdaptiveMonochrome(
    masterBuffer,
    path.join(paths.android, "adaptive_monochrome_432x432.png"),
    bgColor,
  );

  await Promise.all([
    fs.copyFile(path.join(paths.web, "icon_128x128.png"), path.join(paths.public, "index.icon.png")),
    fs.copyFile(
      path.join(paths.web, "apple_touch_180x180.png"),
      path.join(paths.public, "index.apple-touch-icon.png"),
    ),
  ]);

  console.log("Icon generation complete.");
  console.log(`Master source: ${path.relative(ROOT, masterPath)}`);
  console.log(`Adaptive bg color: ${rgbToHex(bgColor)}`);
  console.log(`Generated root: ${path.relative(ROOT, ICON_ROOT)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
