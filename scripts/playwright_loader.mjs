import path from "node:path";
import { pathToFileURL } from "node:url";

const playwrightPath = path.resolve(process.cwd(), "node_modules/playwright/index.mjs");
const playwrightUrl = pathToFileURL(playwrightPath).href;

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "playwright") {
    return { url: playwrightUrl, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
