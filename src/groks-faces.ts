import * as THREE from "three";
import { GROK_COLORS } from "./groks-theme";

/** Small hexagonal connection sockets stay distinct from the Bots' black eyes. */
export function makeGrokClueTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const context = canvas.getContext("2d")!;
  context.translate(64, 64);
  const hexagon = (radius: number) => {
    context.beginPath();
    for (let side = 0; side < 6; side++) {
      const angle = -Math.PI / 2 + side * Math.PI / 3;
      const x = Math.cos(angle) * radius, y = Math.sin(angle) * radius;
      if (side === 0) context.moveTo(x, y); else context.lineTo(x, y);
    }
    context.closePath();
    context.fill();
  };
  context.fillStyle = "#062b30";
  hexagon(48);
  context.fillStyle = "#87f9e8";
  hexagon(36);
  context.fillStyle = "#0c3436";
  hexagon(22);
  context.strokeStyle = "#dcfff8";
  context.lineWidth = 3;
  context.lineCap = "round";
  context.beginPath();
  context.moveTo(-17, -27);
  context.lineTo(0, -36);
  context.lineTo(17, -27);
  context.stroke();
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
