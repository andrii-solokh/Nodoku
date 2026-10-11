import countryCenters from './assets/globe-centers.json';
import landUrl from './assets/globe-land.png';

export interface GlobeLocation {
  country: string;
  name: string;
  visitors: number;
  pageviews: number;
}

const centers: Record<string, number[]> = countryCenters;
const radians = Math.PI / 180;
const format = new Intl.NumberFormat();

export function mountStatisticsGlobe(container: HTMLElement, locations: GlobeLocation[]): () => void {
  const globe = document.createElement('div');
  globe.className = 'statistics-globe';
  globe.innerHTML = `
    <div class="statistics-globe-stage">
      <canvas class="statistics-globe-canvas" role="img" aria-label="Globe of visitor locations. Drag to rotate it, or use the location buttons to browse."></canvas>
      <div class="statistics-globe-markers"></div>
    </div>
    <div class="statistics-globe-detail" aria-live="polite">
      <p class="statistics-globe-position"></p>
      <h3 class="statistics-globe-name"></h3>
      <div class="statistics-globe-measures"><div><strong class="statistics-globe-visitors"></strong><span>Visitors</span></div><div><strong class="statistics-globe-pageviews"></strong><span>Page views</span></div></div>
      <p class="statistics-globe-hint"></p>
      <div class="statistics-globe-controls"><button type="button" data-direction="previous" aria-label="Previous location">←</button><button type="button" data-direction="next" aria-label="Next location">→</button></div>
    </div>`;
  container.replaceChildren(globe);

  const canvas = globe.querySelector<HTMLCanvasElement>('canvas')!;
  const stage = globe.querySelector<HTMLElement>('.statistics-globe-stage')!;
  const markerLayer = globe.querySelector<HTMLElement>('.statistics-globe-markers')!;
  const position = globe.querySelector<HTMLElement>('.statistics-globe-position')!;
  const name = globe.querySelector<HTMLElement>('.statistics-globe-name')!;
  const visitors = globe.querySelector<HTMLElement>('.statistics-globe-visitors')!;
  const pageviews = globe.querySelector<HTMLElement>('.statistics-globe-pageviews')!;
  const hint = globe.querySelector<HTMLElement>('.statistics-globe-hint')!;
  const context = canvas.getContext('2d');
  const markers = locations.map((location, index) => {
    if (!centers[location.country]) return null;
    const marker = document.createElement('button');
    marker.type = 'button';
    marker.className = 'statistics-globe-marker';
    marker.style.setProperty('--marker-size', `${Math.min(24, Math.max(12, 10 + Math.sqrt(location.visitors) * .5))}px`);
    marker.setAttribute('aria-label', `${location.name}: ${format.format(location.visitors)} visitors, ${format.format(location.pageviews)} page views`);
    marker.title = marker.getAttribute('aria-label')!;
    marker.addEventListener('click', () => select(index));
    markerLayer.appendChild(marker);
    return marker;
  });

  let selected = 0;
  let longitude = centers[locations[0].country]?.[0] ?? 0;
  let latitude = centers[locations[0].country]?.[1] ?? 15;
  let land: ImageData | null = null;
  let frame = 0;
  let disposed = false;
  let drag: { x: number; y: number } | null = null;

  const project = (lon: number, lat: number) => {
    const delta = (lon - longitude) * radians;
    const phi = lat * radians;
    const tilt = latitude * radians;
    const cosPhi = Math.cos(phi);
    return {
      x: cosPhi * Math.sin(delta),
      y: Math.cos(tilt) * Math.sin(phi) - Math.sin(tilt) * cosPhi * Math.cos(delta),
      z: Math.sin(tilt) * Math.sin(phi) + Math.cos(tilt) * cosPhi * Math.cos(delta),
    };
  };

  function updateMarkers() {
    for (const [index, location] of locations.entries()) {
      const marker = markers[index];
      if (!marker) continue;
      const [lon, lat] = centers[location.country];
      const point = project(lon, lat);
      marker.hidden = point.z < .04;
      marker.style.left = `${50 + point.x * 46.5}%`;
      marker.style.top = `${50 - point.y * 46.5}%`;
      marker.setAttribute('aria-pressed', String(index === selected));
    }
  }

  function drawGrid(ctx: CanvasRenderingContext2D, size: number) {
    const plot = (points: number[][]) => {
      ctx.beginPath();
      let drawing = false;
      for (const [lon, lat] of points) {
        const point = project(lon, lat);
        if (point.z < 0) { drawing = false; continue; }
        const x = size / 2 + point.x * size * .465;
        const y = size / 2 - point.y * size * .465;
        if (drawing) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
        drawing = true;
      }
      ctx.stroke();
    };
    ctx.strokeStyle = '#ffffff55';
    ctx.lineWidth = Math.max(1, size / 450);
    for (let lon = -180; lon < 180; lon += 30) plot(Array.from({ length: 61 }, (_, index) => [lon, -90 + index * 3]));
    for (let lat = -60; lat <= 60; lat += 30) plot(Array.from({ length: 121 }, (_, index) => [-180 + index * 3, lat]));
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size * .465, 0, Math.PI * 2);
    ctx.strokeStyle = '#6f9c8b';
    ctx.lineWidth = Math.max(1, size / 300);
    ctx.stroke();
  }

  function draw() {
    if (disposed || !context) return;
    const size = Math.min(480, Math.max(1, Math.round(stage.clientWidth * Math.min(devicePixelRatio || 1, 1.5))));
    if (canvas.width !== size || canvas.height !== size) { canvas.width = size; canvas.height = size; }
    const image = context.createImageData(size, size);
    const output = image.data;
    const radius = size * .465;
    const tilt = latitude * radians;
    const sinTilt = Math.sin(tilt);
    const cosTilt = Math.cos(tilt);
    const centerLon = longitude * radians;
    for (let y = 0; y < size; y++) {
      const north = (size / 2 - y) / radius;
      for (let x = 0; x < size; x++) {
        const east = (x - size / 2) / radius;
        const distance = east * east + north * north;
        if (distance > 1) continue;
        const front = Math.sqrt(1 - distance);
        const phi = Math.asin(Math.max(-1, Math.min(1, north * cosTilt + front * sinTilt)));
        const delta = Math.atan2(east, front * cosTilt - north * sinTilt);
        const lon = centerLon + delta;
        const textureX = land ? Math.floor((((lon / (2 * Math.PI) + .5) % 1 + 1) % 1) * land.width) : 0;
        const textureY = land ? Math.min(land.height - 1, Math.max(0, Math.floor((.5 - phi / Math.PI) * land.height))) : 0;
        const landAlpha = land ? land.data[(textureY * land.width + textureX) * 4 + 3] / 255 : 0;
        const shade = .77 + .23 * Math.max(0, east * -.22 + north * .33 + front * .9);
        const offset = (y * size + x) * 4;
        output[offset] = (193 - 80 * landAlpha) * shade;
        output[offset + 1] = (222 - 56 * landAlpha) * shade;
        output[offset + 2] = (215 - 72 * landAlpha) * shade;
        output[offset + 3] = 255;
      }
    }
    context.putImageData(image, 0, 0);
    drawGrid(context, size);
    updateMarkers();
    if (land) canvas.dataset.ready = 'true';
  }

  const schedule = () => { if (!frame && !disposed) frame = requestAnimationFrame(() => { frame = 0; draw(); }); };
  function select(index: number) {
    selected = (index + locations.length) % locations.length;
    const location = locations[selected];
    const center = centers[location.country];
    if (center) { [longitude, latitude] = center; }
    position.textContent = `${selected + 1} of ${locations.length} locations`;
    name.textContent = location.name;
    visitors.textContent = format.format(location.visitors);
    pageviews.textContent = format.format(location.pageviews);
    hint.textContent = center ? 'Drag the globe or select another dot.' : 'This location has no point on the globe.';
    schedule();
  }

  globe.querySelector('[data-direction="previous"]')!.addEventListener('click', () => select(selected - 1));
  globe.querySelector('[data-direction="next"]')!.addEventListener('click', () => select(selected + 1));
  canvas.addEventListener('pointerdown', event => {
    drag = { x: event.clientX, y: event.clientY };
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', event => {
    if (!drag) return;
    longitude -= (event.clientX - drag.x) * .4;
    latitude = Math.max(-75, Math.min(75, latitude + (event.clientY - drag.y) * .25));
    drag = { x: event.clientX, y: event.clientY };
    schedule();
  });
  const endDrag = () => { drag = null; };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  const observer = new ResizeObserver(schedule);
  observer.observe(stage);
  const image = new Image();
  image.onload = () => {
    if (disposed) return;
    const texture = document.createElement('canvas');
    texture.width = image.naturalWidth;
    texture.height = image.naturalHeight;
    const textureContext = texture.getContext('2d');
    if (!textureContext) return;
    textureContext.drawImage(image, 0, 0);
    land = textureContext.getImageData(0, 0, texture.width, texture.height);
    schedule();
  };
  image.src = landUrl;
  select(0);
  return () => {
    disposed = true;
    observer.disconnect();
    cancelAnimationFrame(frame);
    image.onload = null;
  };
}
