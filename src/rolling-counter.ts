import './rolling-counter.css';

const values = new WeakMap<HTMLElement, { value: number | undefined; text: string }>();

/** A separate reel for each decimal place; new updates replace unfinished reels. */
export function renderCounter(element: HTMLElement, value: number | undefined, text: string, options: { animate?: boolean; from?: number } = {}): void {
  const previous = values.get(element);
  if (previous && previous.value === value && previous.text === text && (options.from === undefined || options.from === value)) return;
  const from = options.from ?? previous?.value;
  const roll = options.animate && from !== undefined && value !== undefined && value > from
    && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  for (const animation of element.getAnimations({ subtree: true })) animation.cancel();
  values.set(element, { value, text });
  element.classList.add('rolling-counter');
  const accessible = document.createElement('span');
  accessible.className = 'rolling-counter-value';
  accessible.textContent = text;
  const reels = document.createElement('span');
  reels.className = 'rolling-counter-reels';
  reels.setAttribute('aria-hidden', 'true');
  const decimalDigits = text.replace(/\D/g, '').length;
  let place = decimalDigits;
  for (const character of text) {
    const reel = document.createElement('span');
    reel.className = 'rolling-counter-reel';
    const strip = document.createElement('span');
    strip.className = 'rolling-counter-strip';
    const isDigit = /\d/.test(character);
    const power = isDigit ? 10 ** --place : 1;
    const oldDigit = Math.floor((from ?? 0) / power) % 10;
    const nextDigit = Number(character);
    // Compact notation is rendered without decimal-place arithmetic.
    const steps = roll && isDigit && !/[a-z]/i.test(text) && Math.floor(value! / power) !== Math.floor(from! / power)
      ? (nextDigit - oldDigit + 10) % 10 || 10 : 0;
    for (let index = 0; index <= steps; index++) {
      const digit = document.createElement('span');
      digit.dataset.digit = steps ? String((oldDigit + index) % 10) : character;
      strip.append(digit);
    }
    if (isDigit) reel.classList.add('is-digit');
    reel.append(strip);
    reels.append(reel);
    if (steps) strip.animate([
      { transform: 'translateY(0)' },
      { transform: `translateY(-${steps}em)` },
    ], { duration: 600, delay: Math.min(place * 35, 140), easing: 'cubic-bezier(.22,.7,.25,1)', fill: 'forwards' });
  }
  element.replaceChildren(accessible, reels);
}
