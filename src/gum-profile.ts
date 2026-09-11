/** Physical radius and dr/dz for one half of a gummy connection. */
export function gumProfileAt(y: number, length: number, neck: number, nodeRadius: number, stretch: number): [number, number] {
  if (stretch <= 0 || nodeRadius <= 0 || length <= .00001) return [neck, 0];
  const desiredJoin = Math.min(nodeRadius * .98, Math.max(nodeRadius * .58, neck * 1.2));
  const joinDistance = Math.min(Math.sqrt(nodeRadius ** 2 - desiredJoin ** 2), length * .45);
  const joinRadius = Math.sqrt(nodeRadius ** 2 - joinDistance ** 2);
  const joinSlope = joinDistance / joinRadius;
  // The cubic's endpoint control radius is joinRadius - width*joinSlope/3.
  // Bound it above zero even when a wide strand tapers into a tiny droplet.
  const slopeBudget = 2 * Math.min(Math.abs(joinRadius - neck), joinRadius);
  const width = Math.max(.000001, Math.min(length * .5 - joinDistance,
    slopeBudget / Math.max(joinSlope, .000001)) * (.4 + .6 * stretch));
  const distance = (.5 - Math.abs(y)) * length;
  const direction = Math.sign(y);
  if (distance < joinDistance) {
    // Once the strand touches the sphere tangentially, bury its remaining
    // rings just inside it instead of leaving coplanar surfaces or an end cap.
    const sphere = Math.sqrt(Math.max(1e-12, nodeRadius ** 2 - distance ** 2));
    const inset = joinDistance - distance;
    return [sphere - .35 * inset ** 2 / nodeRadius,
      direction * (distance / sphere - .7 * inset / nodeRadius)];
  }
  const t = Math.max(0, Math.min(1, (joinDistance + width - distance) / width));
  const delta = joinRadius - neck;
  return [neck + delta * t * t * (3 - 2 * t) + width * joinSlope * t * t * (t - 1),
    direction * (6 * delta * t * (1 - t) / width + joinSlope * (3 * t * t - 2 * t))];
}

/** Give a larger endpoint room for its shoulder on a short, asymmetric strand. */
export function gumLinkProfileAt(y: number, length: number, neck: number, startRadius: number, endRadius: number, stretch: number): [number, number] {
  if (length <= .00001) return [neck, 0];
  if (startRadius === endRadius) return gumProfileAt(y, length, neck, startRadius, stretch);
  const share = Math.max(.00001, Math.min(.99999, startRadius / Math.max(.000001, startRadius + endRadius)));
  const u = y + .5;
  // gumProfileAt returns physical radius and world-space slope. Rescaling its
  // parameter gives each end a different span without changing those units.
  return u < share
    ? gumProfileAt(-.5 + u / (2 * share), length * 2 * share, neck, startRadius, stretch)
    : gumProfileAt(.5 - (1 - u) / (2 * (1 - share)), length * 2 * (1 - share), neck, endRadius, stretch);
}
