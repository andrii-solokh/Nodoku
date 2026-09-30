import * as THREE from "three";

/** Transparent details appear only after a node's clue dots have cleared. */
export function makeCharacterFaces(): THREE.CanvasTexture[] {
  const black = "#19151e";
  const circle = (context: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string) => {
    context.fillStyle = color;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  };
  const ellipse = (context: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, color: string, angle = 0) => {
    context.fillStyle = color;
    context.beginPath();
    context.ellipse(x, y, rx, ry, angle, 0, Math.PI * 2);
    context.fill();
  };
  return Array.from({ length: 4 }, (_, character) => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 256;
    const context = canvas.getContext("2d")!;
    context.lineCap = "round";
    context.lineJoin = "round";
    if (character === 0) {
      ellipse(context, 112, 58, 79, 29, black, -.17);
      circle(context, 102, 27, 15, black);
      ellipse(context, 101, 141, 8, 14, black);
      ellipse(context, 157, 141, 8, 14, black);
    } else if (character === 1) {
      circle(context, 90, 78, 24, "#fffdf6");
      circle(context, 166, 78, 24, "#fffdf6");
      circle(context, 96, 82, 14, black);
      circle(context, 160, 82, 14, black);
    } else if (character === 2) {
      context.strokeStyle = black;
      context.lineWidth = 9;
      context.beginPath();
      context.arc(91, 135, 34, 0, Math.PI * 2);
      context.arc(165, 135, 34, 0, Math.PI * 2);
      context.moveTo(125, 133);
      context.lineTo(131, 133);
      context.moveTo(57, 132);
      context.lineTo(35, 135);
      context.moveTo(199, 132);
      context.lineTo(221, 135);
      context.stroke();
      context.lineWidth = 7;
      for (const x of [91, 165]) {
        context.beginPath();
        context.arc(x, 140, 11, .15, Math.PI - .15);
        context.stroke();
      }
    } else {
      ellipse(context, 92, 137, 33, 34, black);
      ellipse(context, 164, 137, 33, 34, black);
      context.strokeStyle = black;
      context.lineWidth = 8;
      context.beginPath();
      context.moveTo(124, 132);
      context.quadraticCurveTo(128, 126, 132, 132);
      context.stroke();
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  });
}
