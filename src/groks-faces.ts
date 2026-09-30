import * as THREE from "three";
import { GROK_COLORS } from "./groks-theme";

/** Mint, four-point clue sparks stay distinct from the Bots' black eyes. */
export function makeGrokClueTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const context = canvas.getContext("2d")!;
  context.translate(64, 64);
  const sparkle = (radius: number, inset: number) => {
    context.beginPath();
    context.moveTo(0, -radius);
    context.lineTo(inset, -inset);
    context.lineTo(radius, 0);
    context.lineTo(inset, inset);
    context.lineTo(0, radius);
    context.lineTo(-inset, inset);
    context.lineTo(-radius, 0);
    context.lineTo(-inset, -inset);
    context.closePath();
    context.fill();
  };
  context.fillStyle = "#062c35";
  sparkle(51, 13);
  context.fillStyle = "#1ce8cc";
  sparkle(35, 9);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** The two capsule eyes reveal when puzzle clue dots are cleared. */
export function makeGrokFaces(): THREE.CanvasTexture[] {
  return GROK_COLORS.map((_, variant) => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 256;
    const context = canvas.getContext("2d")!;
    const tilt = [-.27, -.22, .14, -.16, .2, -.3, .12, -.2][variant];
    context.fillStyle = "#101112";
    for (const x of [99, 157]) {
      context.beginPath();
      context.ellipse(x, 129 + (variant % 3 - 1) * 3, 8, 16, tilt, 0, Math.PI * 2);
      context.fill();
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  });
}
