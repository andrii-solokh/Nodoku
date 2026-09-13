export const complexityIcon = (level: number) =>
  `<svg class="complexity-icon" viewBox="0 0 40 20" aria-hidden="true"><path class="complexity-track" d="M6 10h28"/>${level > 1 ? `<path class="complexity-link" d="M6 10h${(level - 1) * 14}"/>` : ""}${[1, 2, 3].map(dot => `<circle class="complexity-dot${dot <= level ? " filled" : ""}" cx="${6 + (dot - 1) * 14}" cy="10" r="3.5"/>`).join("")}</svg>`;
