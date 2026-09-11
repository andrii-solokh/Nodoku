import { Matrix4, Quaternion, Vector3 } from "three";

export type TurnDirection = "left" | "right" | "up" | "down";
export type CubeFace = "front" | "back" | "right" | "left" | "top" | "bottom";
export interface CubeOrientation {
  face: CubeFace;
  quaternion: Quaternion;
  direction: Vector3;
  up: Vector3;
}

const faces: [CubeFace, Vector3][] = [
  ["front", new Vector3(0, 0, 1)],
  ["back", new Vector3(0, 0, -1)],
  ["right", new Vector3(1, 0, 0)],
  ["left", new Vector3(-1, 0, 0)],
  ["top", new Vector3(0, 1, 0)],
  ["bottom", new Vector3(0, -1, 0)],
];
const upDirections = [
  new Vector3(0, 1, 0),
  new Vector3(0, 0, -1),
  new Vector3(1, 0, 0),
  new Vector3(0, -1, 0),
  new Vector3(0, 0, 1),
  new Vector3(-1, 0, 0),
];

/** Six outward face normals, each with four possible screen-up directions. */
export const CUBE_ORIENTATIONS: CubeOrientation[] = faces.flatMap(
  ([face, direction]) =>
    upDirections
      .filter((up) => up.dot(direction) === 0)
      .map((up) => ({
        face,
        direction: direction.clone(),
        up: up.clone(),
        quaternion: new Quaternion().setFromRotationMatrix(
          new Matrix4().makeBasis(up.clone().cross(direction), up, direction),
        ),
      })),
);

export function nearestOrientation(
  value: Quaternion,
  flat = false,
): CubeOrientation {
  const candidates = flat
    ? CUBE_ORIENTATIONS.filter((item) => item.face === "front")
    : CUBE_ORIENTATIONS;
  return candidates.reduce((best, item) =>
    Math.abs(value.dot(item.quaternion)) > Math.abs(value.dot(best.quaternion))
      ? item
      : best,
  );
}

/** Rotate in screen coordinates so controls stay consistent even at the poles. */
export function quarterTurn(
  value: Quaternion,
  direction: TurnDirection,
  flat = false,
): Quaternion {
  const from = nearestOrientation(value, flat).quaternion;
  const horizontal = direction === "left" || direction === "right";
  const axis = flat
    ? new Vector3(0, 0, 1)
    : horizontal
      ? new Vector3(0, 1, 0)
      : new Vector3(1, 0, 0);
  const sign = flat
    ? direction === "left" || direction === "up"
      ? 1
      : -1
    : direction === "left" || direction === "up"
      ? -1
      : 1;
  const result = from
    .clone()
    .multiply(new Quaternion().setFromAxisAngle(axis, (sign * Math.PI) / 2));
  return nearestOrientation(result, flat).quaternion.clone();
}
