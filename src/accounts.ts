import { perspectiveIcon } from './perspective-icons';
import { normalizeProfileLink } from './profile-link';
import type { Puzzle } from './puzzle';
import { timeoutSignal } from './timeout';
import './accounts.css';
import { complexityIcon } from './complexity-icon';
import { loadGoogleIdentity } from './google-signin';

type Player = { id: string; nickname: string; avatarUrl?: string; profileUrl?: string };
type Ranking = { entries: { id: string; nickname: string; profileUrl?: string; solved: number; rank: number; bestTimeMs: number | null }[]; me: { solved: number; rank: number | null; bestTimeMs: number | null } | null };
function formatBestTime(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return '—';
  if (ms < 1000) return '<1s';
  const seconds = Math.floor(ms / 1000);
  return seconds >= 3600
    ? `${Math.floor(seconds / 3600)}:${String(Math.floor(seconds / 60) % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
    : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
let enabled = false;
let clientId = '';
let player: Player | null = null;
let ready: Promise<void> | undefined;
const tickets = new Map<string, Promise<string | undefined>>();
const PREFIX = 'nodoku.ranked-attempt.v1.';
async function api(path: string, body?: unknown, signal?: AbortSignal) {
  const response = await fetch(path, { credentials: 'same-origin', cache: 'no-store', signal: signal ?? timeoutSignal(8000),
    ...(body !== undefined ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || 'Please try again.');
  return value;
}
function initialize(): Promise<void> {
  return ready ??= (async () => {
    try {
      const config = await api('/api/auth/config'); enabled = config.enabled === true; clientId = config.clientId;
      if (enabled) player = (await api('/api/auth/me')).player;
    } catch { enabled = false; }
  })();
}

export function prepareRankedAttempt(puzzle: Puzzle, attemptId: string): void {
  if (tickets.has(attemptId) || puzzle.solved || puzzle.settings.size < 3) return;
  const settings = { ...puzzle.settings };
  const alreadyStarted = puzzle.edges.length > 0;
  tickets.set(attemptId, (async () => {
    await initialize();
    if (!enabled) return;
    // Another tab may have signed out or switched accounts since initialization.
    try { player = (await api('/api/auth/me')).player; } catch { return; }
    if (!player) return;
    const playerId = player.id;
    try {
      const saved = JSON.parse(localStorage.getItem(PREFIX + attemptId) || 'null');
      if (saved?.playerId === playerId && saved.expires > Date.now() && /^[a-f0-9]{64}$/.test(saved.ticket)) return saved.ticket;
    } catch { /* Local storage is optional. */ }
    if (alreadyStarted) return;
    try {
      const result = await api('/api/ranked-attempts', { settings });
      if (result.playerId !== playerId || !/^[a-f0-9]{64}$/.test(result.ticket)) return;
      try { localStorage.setItem(PREFIX + attemptId, JSON.stringify({ ...result, expires: Date.now() + 7 * 86400000 })); } catch { /* In-memory attribution still works. */ }
      return result.ticket as string;
    } catch { /* Guest completion always works if ranking is unavailable. */ }
  })());
}
export async function getRankedTicket(attemptId: string): Promise<string | undefined> {
  if (tickets.has(attemptId)) return tickets.get(attemptId);
  // A reload can restore a pending solve before the game scene is mounted.
  try {
    const saved = JSON.parse(localStorage.getItem(PREFIX + attemptId) || 'null');
    if (saved?.expires > Date.now() && /^[a-f0-9]{64}$/.test(saved.ticket)) return saved.ticket;
  } catch { /* Historical guest completions have no ranked ticket. */ }
  return undefined;
}
export function forgetRankedTicket(attemptId: string): void {
  tickets.delete(attemptId);
  try { localStorage.removeItem(PREFIX + attemptId); } catch { /* Optional storage. */ }
}

const difficulties = [['easy', 'Gentle'], ['medium', 'Focused'], ['hard', 'Intricate']] as const;
const rankingColumns = '<colgroup><col class="ranking-rank"><col><col class="ranking-solved"><col class="ranking-time"></colgroup>';
const trophy = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M8 3h8v6a4 4 0 0 1-8 0V3ZM8 5H4v3a4 4 0 0 0 4 4m8-7h4v3a4 4 0 0 1-4 4M12 13v5m-4 3h8m-7-3h6v3H9z"/></svg>';
const personIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 22v-3a8 8 0 0 1 16 0v3"/></svg>';
export function mountAccounts(beforeOpen: () => void, afterClose: () => void): void {
  const nav = document.querySelector('.header-actions')!;
  const controls = document.createElement('div'); controls.className = 'account-header'; controls.hidden = true;
  controls.innerHTML = `<button class="icon-button" id="leaderboard-button" aria-label="Leaderboard" title="Leaderboard">${trophy}</button><button class="icon-button" id="account-button" aria-label="Sign in" title="Sign in">${personIcon}</button>`;
  nav.append(controls);
  const makePopup = (id: string, title: string, content: string) => {
    const popup = document.createElement('div'); popup.id = id; popup.className = 'player-popup'; popup.hidden = true;
    popup.setAttribute('role', 'dialog'); popup.setAttribute('aria-labelledby', `${id}-title`);
    popup.innerHTML = `<div class="player-dialog-heading"><h2 id="${id}-title">${title}</h2><button type="button" class="icon-button player-close" aria-label="Close ${title.toLowerCase()}">×</button></div>${content}<p class="player-status" role="status" aria-live="polite"></p>`;
    document.body.append(popup); return popup;
  };
  const leaderboard = makePopup('leaderboard-popup', 'Leaderboard', `    <div class="ranking-view">
      <div class="ranking-filter-heading"><p class="player-caption">All-time puzzles solved</p>
      <div class="ranking-perspectives" role="group" aria-label="Puzzle perspective">
        <button type="button" data-ranking-perspective="3d" aria-pressed="true">${perspectiveIcon('cube')}3D</button>
        <button type="button" data-ranking-perspective="flat" aria-pressed="false">${perspectiveIcon('flat')}Flat</button>
      </div></div>
      <div class="ranking-matrix" role="group" aria-label="Grid size and complexity">
        ${[3, 4, 5].map(size => `<span class="ranking-matrix-size" data-ranking-size-label="${size}">${size} × ${size}</span>${difficulties.map(([difficulty, label], level) => `<button type="button" data-ranking-size="${size}" data-ranking-difficulty="${difficulty}" aria-label="${size} by ${size}, ${label}" title="${size} by ${size}, ${label}" aria-pressed="false">${complexityIcon(level + 1)}</button>`).join('')}`).join('')}
      </div>
      <table class="ranking-personal ranking-grid-table" aria-label="Your ranking" hidden>${rankingColumns}<tbody></tbody></table>
      <div class="ranking-table-scroll" role="region" aria-label="Top 100 players" tabindex="0"><table class="ranking-table ranking-grid-table">${rankingColumns}<thead><tr><th>Rank</th><th>Player</th><th>Solved</th><th title="Fastest puzzle, from start to verified completion. Includes breaks and hints.">Best time</th></tr></thead><tbody></tbody></table></div>
      <p class="ranking-empty" hidden>No solves here yet. Make the first connection.</p>
      <p class="player-caption">Each puzzle counts once per player. Equal totals share a rank. Showing the top 100.</p>
    </div>
`);
  const profile = makePopup('profile-popup', 'Your profile', `    <div class="profile-view">
      <div class="player-guest"><p>Keep your achievements across devices and join the leaderboard.</p><div class="player-google-slot"><div class="player-google-button"></div><button type="button" class="player-signin" disabled aria-label="Loading Google sign-in"><img src="/google-g.png" width="20" height="20" alt=""><span>Continue with Google</span></button></div><p class="player-caption">You can always play as a guest.</p></div>
      <form class="player-profile" hidden><label>Public nickname<input name="nickname" minlength="1" maxlength="24" required autocomplete="nickname"></label>
        <label>Link (optional)<input type="text" name="profileUrl" inputmode="url" maxlength="2048" autocomplete="url" autocapitalize="none" spellcheck="false" placeholder="x.com/yourname" aria-describedby="profile-link-note"><span id="profile-link-note" class="profile-link-note">Shown on the leaderboard</span></label>
        <div class="player-profile-actions">
          <button class="start-button" type="submit">Save</button>
          <button class="icon-button player-logout" type="button" aria-label="Sign out" title="Sign out"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4M16 8l4 4-4 4M8 12h12"/></svg></button>
        </div>
      </form>
    </div>`);
  const popups = { leaderboard, profile };
  type PopupName = keyof typeof popups;
  const triggers = { leaderboard: controls.querySelector<HTMLButtonElement>('#leaderboard-button')!, profile: controls.querySelector<HTMLButtonElement>('#account-button')! };
  const find = <T extends HTMLElement>(selector: string) => (profile.querySelector<T>(selector) ?? leaderboard.querySelector<T>(selector))!;
  const status = profile.querySelector<HTMLElement>('.player-status')!;
  const rankingStatus = leaderboard.querySelector<HTMLElement>('.player-status')!;
  let active: PopupName | null = null, revision = 0, profileRevision = 0;
  let rankingPerspective = '3d', rankingSize: number | null = null, rankingDifficulty: string | null = null;
  const updateRankingControls = () => {
    if (rankingPerspective === 'flat' && rankingSize === 3) rankingSize = 4;
    leaderboard.querySelectorAll<HTMLElement>('[data-ranking-size-label]').forEach(label => {
      label.hidden = rankingPerspective === 'flat' && Number(label.dataset.rankingSizeLabel) < 4;
    });
    leaderboard.querySelectorAll<HTMLButtonElement>('[data-ranking-perspective]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.rankingPerspective === rankingPerspective));
    });
    leaderboard.querySelectorAll<HTMLButtonElement>('[data-ranking-size]').forEach(button => {
      const size = Number(button.dataset.rankingSize), difficulty = button.dataset.rankingDifficulty;
      button.hidden = rankingPerspective === 'flat' && size < 4;
      button.disabled = button.hidden;
      const dimensions = rankingPerspective === '3d' ? `${size} × ${size} × ${size}` : `${size} × ${size}`;
      const label = `${dimensions}, ${difficulties.find(([key]) => key === difficulty)![1]}`;
      button.setAttribute('aria-label', label); button.title = label;
      button.setAttribute('aria-pressed', String(size === rankingSize && difficulty === rankingDifficulty));
    });

  };
  leaderboard.querySelectorAll<HTMLButtonElement>('[data-ranking-perspective]').forEach(button => button.addEventListener('click', () => {
    rankingPerspective = button.dataset.rankingPerspective!;
    updateRankingControls(); void ranking();
  }));
  leaderboard.querySelectorAll<HTMLButtonElement>('[data-ranking-size]').forEach(button => button.addEventListener('click', () => {
    rankingSize = Number(button.dataset.rankingSize); rankingDifficulty = button.dataset.rankingDifficulty!;
    updateRankingControls(); void ranking();
  }));
  let popupRequest: AbortController | undefined;
  let signInRevision = 0, signingIn = false;
  let signInExpiresAt = 0, signInButtonWidth = 0;
  let signInRefresh: ReturnType<typeof setTimeout> | undefined;
  const googleButton = find('.player-google-button');
  const signInRetry = find<HTMLButtonElement>('.player-signin');
  async function prepareSignIn() {
    const width = Math.floor(find('.player-google-slot').clientWidth);
    if (!width || active !== 'profile' || player) return;
    if (signInExpiresAt > Date.now() && signInButtonWidth === width) {
      clearTimeout(signInRefresh);
      signInRefresh = setTimeout(() => void prepareSignIn(), signInExpiresAt - Date.now());
      return;
    }
    const version = ++signInRevision;
    signInExpiresAt = 0;
    clearTimeout(signInRefresh);
    googleButton.inert = true;
    signInRetry.disabled = true;
    signInRetry.setAttribute('aria-label', 'Loading Google sign-in');
    signInRetry.querySelector('span')!.textContent = 'Continue with Google';
    try {
      const identity = await loadGoogleIdentity();
      if (version !== signInRevision || active !== 'profile' || player) return;
      const challengeStarted = Date.now();
      const { nonce } = await api('/api/auth/challenge', {});
      if (version !== signInRevision || active !== 'profile' || player) return;
      identity.initialize({ client_id: clientId, nonce, ux_mode: 'popup', auto_select: false,
        callback: async ({ credential }) => {
          if (signingIn) return;
          signingIn = true; signInExpiresAt = 0; ++profileRevision; clearTimeout(signInRefresh);
          status.textContent = 'Signing in…';
          try {
            const result = await api('/api/auth/google', { credential });
            player = result.player; updateProfile();
            status.textContent = '';
            if (active === 'profile') find<HTMLInputElement>('[name="nickname"]').focus({ preventScroll: true });
            if (active === 'leaderboard') void ranking();
          } catch (error) {
            status.textContent = (error as Error).message;
            if (active === 'profile') void prepareSignIn();
          } finally { signingIn = false; }
        },
      });
      if (!googleButton.childElementCount || signInButtonWidth !== width) {
        googleButton.replaceChildren();
        identity.renderButton(googleButton, { theme: 'outline', size: 'large', shape: 'pill', text: 'continue_with', width });
        signInButtonWidth = width;
      }
      googleButton.style.visibility = '';
      googleButton.inert = false;
      signInRetry.hidden = true;
      // The login challenge lasts ten minutes. Refresh while the menu is open.
      signInExpiresAt = challengeStarted + 9 * 60 * 1000;
      signInRefresh = setTimeout(() => void prepareSignIn(), Math.max(0, signInExpiresAt - Date.now()));
    } catch (error) {
      if (version !== signInRevision || active !== 'profile') return;
      signInExpiresAt = 0;
      googleButton.style.visibility = 'hidden';
      signInRetry.hidden = false;
      signInRetry.removeAttribute('aria-label');
      status.textContent = (error as Error).message;
      signInRetry.disabled = false; signInRetry.querySelector('span')!.textContent = 'Try Google again';
    }
  }
  signInRetry.addEventListener('click', () => void prepareSignIn());
  async function popupApi(path: string) {
    const controller = popupRequest;
    const timer = setTimeout(() => controller?.abort(), 8000);
    try { return await api(path, undefined, controller?.signal); }
    finally { clearTimeout(timer); }
  }
  const updateProfile = () => {
    find('.player-guest').hidden = !!player;
    find('.player-profile').hidden = !player;
    const invite = document.querySelector('.completion-account');
    if (invite) invite.textContent = player ? 'View your ranking' : 'Join the leaderboard';
    const profileButton = controls.querySelector<HTMLButtonElement>('#account-button')!;
    profileButton.setAttribute('aria-label', player ? 'Your profile' : 'Sign in');
    profileButton.setAttribute('title', player ? 'Your profile' : 'Sign in');
    profileButton.innerHTML = personIcon;
    if (player?.avatarUrl) {
      const avatar = document.createElement('img');
      avatar.className = 'player-avatar'; avatar.alt = ''; avatar.referrerPolicy = 'no-referrer';
      avatar.addEventListener('load', () => {
        if (avatar.parentElement === profileButton) profileButton.querySelector('svg')?.remove();
      }, { once: true });
      avatar.addEventListener('error', () => avatar.remove(), { once: true });
      avatar.src = player.avatarUrl;
      profileButton.append(avatar);
    }
    if (player) {
      find<HTMLInputElement>('[name="nickname"]').value = player.nickname;
      find<HTMLInputElement>('[name="profileUrl"]').value = player.profileUrl ?? '';
    }
  };
  async function ranking() {
    const version = ++revision; rankingStatus.textContent = 'Loading players…';
    find('.ranking-table').hidden = true; find('.ranking-table-scroll').hidden = true; find('.ranking-empty').hidden = true; find('.ranking-personal').hidden = true;
    try {
      const params = new URLSearchParams({ period: 'all', perspective: rankingPerspective });
      if (rankingSize !== null) params.set('size', String(rankingSize));
      if (rankingDifficulty !== null) params.set('difficulty', rankingDifficulty);
      const result: Ranking = await popupApi(`/api/leaderboard?${params}`);
      if (revision !== version) return;
      const rows = find('.ranking-table tbody'); rows.replaceChildren();
      for (const entry of result.entries) {
        const tr = document.createElement('tr');
        if (entry.id === player?.id) { tr.className = 'is-you'; tr.setAttribute('aria-label', 'Your ranking'); }
        for (const value of [entry.rank, entry.nickname, entry.solved, formatBestTime(entry.bestTimeMs)]) {
          const td = document.createElement('td'); td.textContent = String(value); tr.append(td);
        }
        const profileUrl = normalizeProfileLink(entry.profileUrl);
        if (profileUrl) {
          const link = document.createElement('a');
          link.className = 'ranking-player-link'; link.href = profileUrl; link.textContent = entry.nickname;
          link.target = '_blank'; link.rel = 'noopener noreferrer nofollow ugc';
          link.setAttribute('aria-label', `${entry.nickname} — ${new URL(profileUrl).hostname} (opens in a new tab)`);
          tr.children[1].replaceChildren(link);
        }
        rows.append(tr);
      }
      find('.ranking-table').hidden = !result.entries.length;
      find('.ranking-table-scroll').hidden = !result.entries.length;
      find('.ranking-table-scroll').scrollTop = 0;
      find('.ranking-empty').hidden = !!result.entries.length;
      const personal = find('.ranking-personal'); personal.hidden = !result.me;
      if (result.me) {
        personal.setAttribute('aria-label', `Your ranking: Rank ${result.me.rank?.toLocaleString() ?? 'unranked'}, ${result.me.solved.toLocaleString()} solved, best time ${formatBestTime(result.me.bestTimeMs)}`);
        const row = document.createElement('tr'); row.className = 'is-you';
        for (const value of [result.me.rank?.toLocaleString() ?? '—', 'You', result.me.solved.toLocaleString(), formatBestTime(result.me.bestTimeMs)]) {
          const cell = document.createElement('td'); cell.textContent = value; row.append(cell);
        }
        personal.querySelector('tbody')!.replaceChildren(row);
      }
      rankingStatus.textContent = '';
    } catch (error) { if (revision === version) rankingStatus.textContent = (error as Error).message; }
  }
  function position() {
    if (!active) return;
    const popup = popups[active], anchor = triggers[active].getBoundingClientRect();
    const width = document.documentElement.clientWidth, height = window.visualViewport?.height ?? window.innerHeight;
    const top = Math.max(12, Math.min(anchor.bottom + 10, height - 120));
    popup.style.top = `${top}px`;
    popup.style.left = `${Math.max(12, Math.min(anchor.right - popup.getBoundingClientRect().width, width - popup.getBoundingClientRect().width - 12))}px`;
    popup.style.maxHeight = `${Math.max(100, height - top - 12)}px`;
  }
  function close(restoreFocus = false) {
    if (!active) return;
    const name = active; active = null; ++revision; ++profileRevision; ++signInRevision; clearTimeout(signInRefresh);
    popupRequest?.abort(); popupRequest = undefined;
    popups[name].hidden = true; triggers[name].setAttribute('aria-expanded', 'false');
    if (restoreFocus) triggers[name].focus({ preventScroll: true });
    afterClose();
  }
  async function open(name: PopupName) {
    close(); beforeOpen(); active = name;
    popupRequest = new AbortController();
    popups[name].hidden = false; triggers[name].setAttribute('aria-expanded', 'true');
    status.textContent = ''; updateProfile(); position();
    popups[name].querySelector<HTMLButtonElement>('.player-close')!.focus({ preventScroll: true });
    const version = ++profileRevision;
    try { const result = await popupApi('/api/auth/me'); if (version === profileRevision) { player = result.player; updateProfile(); } } catch { /* Keep the available profile. */ }
    if (active === name && version === profileRevision) {
      if (name === 'leaderboard') void ranking();
      else if (!player) void prepareSignIn();
    }
  }
  for (const name of ['leaderboard', 'profile'] as const) {
    triggers[name].setAttribute('aria-haspopup', 'dialog');
    triggers[name].setAttribute('aria-controls', popups[name].id);
    triggers[name].setAttribute('aria-expanded', 'false');
    triggers[name].addEventListener('click', () => active === name ? close(true) : void open(name));
    popups[name].querySelector('.player-close')!.addEventListener('click', () => close(true));
    // Typing and navigating in a popup must not activate game shortcuts.
    popups[name].addEventListener('keydown', event => event.stopPropagation());
  }
  document.addEventListener('pointerdown', event => {
    if (active && !popups[active].contains(event.target as Node) && !controls.contains(event.target as Node)) close();
  }, true);
  // Google and password-manager helpers can take focus outside the popup.
  // Dismiss only on explicit actions, not incidental focus changes during sign-in.
  document.addEventListener('keydown', event => {
    if (active && event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); }
  }, true);
  window.addEventListener('resize', position);
  window.addEventListener('resize', () => { if (active === 'profile' && !player) void prepareSignIn(); });
  window.visualViewport?.addEventListener('resize', position);
  window.addEventListener('scroll', position, { passive: true });
  find('form').addEventListener('submit', event => {
    event.preventDefault();
    void action(async () => {
      const result = await api('/api/auth/profile', { nickname: find<HTMLInputElement>('[name="nickname"]').value, profileUrl: find<HTMLInputElement>('[name="profileUrl"]').value });
      player = result.player; updateProfile(); status.textContent = 'Profile saved.';
    });
  });
  async function action(work: () => Promise<void>) {
    const buttons = [...profile.querySelectorAll<HTMLButtonElement>('.player-profile button')];
    buttons.forEach(button => button.disabled = true); status.textContent = '';
    try { await work(); } catch (error) { status.textContent = (error as Error).message; }
    finally { buttons.forEach(button => button.disabled = false); }
  }
  async function signOut() {
    await api('/api/auth/logout', {});
    player = null; signInExpiresAt = 0; tickets.clear(); updateProfile();
    if (active === 'profile') void prepareSignIn();
    try {
      for (const key of Object.keys(localStorage)) if (key.startsWith(PREFIX)) localStorage.removeItem(key);
    } catch { /* Pending completed solves retain their original attribution separately. */ }
    status.textContent = 'Signed out. You can keep playing as a guest.';
  }
  find('.player-logout').addEventListener('click', () => void action(signOut));
  window.addEventListener('nodoku:statistics-updated', () => { if (active === 'leaderboard') void ranking(); });
  void initialize().then(() => {
    controls.hidden = !enabled; document.body.classList.toggle('has-player-accounts', enabled); updateProfile();
    const invite = document.createElement('button'); invite.className = 'text-button completion-account'; invite.hidden = !enabled;
    invite.textContent = player ? 'View your ranking' : 'Join the leaderboard';
    invite.addEventListener('click', () => void open(player ? 'leaderboard' : 'profile'));
    document.querySelector('#completion-dialog')?.append(invite);
    try {
      if (enabled && player && sessionStorage.getItem('nodoku.signin.done')) {
        sessionStorage.removeItem('nodoku.signin.done'); void open('profile');
      }
    } catch { /* No return prompt without storage. */ }
  });
}
