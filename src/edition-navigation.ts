export type Edition = "nodoku" | "dots" | "groks";

export const EDITION_NAVIGATION_MARKER = "<!-- edition-navigation -->";

export function editionNavigation(edition: Edition): string {
  return `<nav class="edition-switch" aria-label="Choose a game edition">
  <a class="edition-link edition-groks" href="/groks/"${edition === "groks" ? ' aria-current="page"' : ''}><svg viewBox="0 0 34 34" aria-hidden="true"><path d="M17 2 31 10v14L17 32 3 24V10Z" fill="currentColor"/><g fill="#101112" transform="rotate(-15 17 17)"><rect x="11" y="11" width="3.5" height="9" rx="1.7"/><rect x="20" y="11" width="3.5" height="9" rx="1.7"/></g></svg>groks</a>
  <span class="edition-versus" aria-hidden="true">vs</span>
  <a class="edition-link edition-dots" href="/dots/"${edition === "dots" ? ' aria-current="page"' : ''}><svg viewBox="0 0 34 34" aria-hidden="true"><path d="M8 9h18v17H8Z" fill="none" stroke="currentColor" stroke-width="2.5"/><circle cx="8" cy="9" r="4.7" fill="#68b9ff"/><circle cx="26" cy="9" r="4.7" fill="#b8ed67"/><circle cx="8" cy="26" r="4.7" fill="#ffd560"/><circle cx="26" cy="26" r="4.7" fill="#f78cda"/></svg>dots</a>
</nav>`;
}

export function prerenderEditionNavigation(html: string, pathname: string): string {
  const edition: Edition = pathname.startsWith("/dots/") ? "dots"
    : pathname.startsWith("/groks/") ? "groks" : "nodoku";
  return html.replace(EDITION_NAVIGATION_MARKER, editionNavigation(edition));
}
