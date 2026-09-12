import { mountStatistics, openStatistics, parseStatistics, type StatisticsData } from './statistics';

const HEARTBEAT_MS = 30_000;
const STATISTICS_REFRESH_MS = 60_000;
const metrics = [
  { key: 'puzzlesSolved', id: 'puzzles-solved-count', label: 'Puzzles solved' },
  { key: 'connectionsCompleted', id: 'connections-completed-count', label: 'Connections' },
  { key: 'dotsCleared', id: 'dots-cleared-count', label: 'Dots cleared' },
  { key: 'visitors', id: 'visitor-count', label: 'Visitors' },
] as const;

type PuzzleActivity = { attemptId: string; connections: number; solved: boolean };
let currentPuzzleActivity: PuzzleActivity | null = null;
export function updateAudiencePuzzle(activity: PuzzleActivity | null): void {
  currentPuzzleActivity = activity;
  window.dispatchEvent(new CustomEvent('nodoku:puzzle-activity', { detail: activity }));
}

/** One browser identity counts once, even when several tabs send heartbeats. */
export function mountAudience(widgets: HTMLElement[], visitorId: string, options: { beforeOpen?: () => void } = {}): void {
  mountStatistics(options);
  for (const [index, widget] of widgets.entries()) {
    const suffix = index === 0 ? '' : '-game';
    widget.classList.add('is-loading');
    widget.setAttribute('aria-busy', 'true');
    widget.setAttribute('role', 'group');
    widget.setAttribute('aria-label', 'Player activity');
    widget.innerHTML = `<button class="audience-link" type="button" aria-label="Open statistics">
      <span class="visitor-scope" hidden>Preview</span>
      <span class="audience-counter audience-online" title="Browsers active in the last 90 seconds"><span class="visitor-dot" aria-hidden="true"></span><strong id="online-count${suffix}">—</strong><span>Online</span></span>
      <span class="audience-divider" aria-hidden="true"></span>
      <span class="audience-rotating">${metrics.map((metric, metricIndex) => `<span class="audience-counter audience-${metric.key}" ${metricIndex ? 'hidden' : ''}><strong id="${metric.id}${suffix}">—</strong><span>${metric.label}</span></span>`).join('')}</span>
    </button>`;
    widget.querySelector('button')!.addEventListener('click', () => openStatistics());
  }
  const format = new Intl.NumberFormat();
  const compact = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 });
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let registeredDay = '';
  let statisticsUpdatedAt = -Infinity;
  let timer: number | undefined;
  let metricIndex = 0;
  let activity: (PuzzleActivity & { showProgress: boolean }) | null = currentPuzzleActivity
    ? { ...currentPuzzleActivity, showProgress: false } : null;
  let detailTimer: number | undefined;
  let active: AbortController | null = null;
  let away = false;
  let statistics: StatisticsData | null = null;
  let onlineCount: number | null = null;
  let initialPresenceReady = false;
  let initialTotalsReady = false;
  let audienceRevealed = false;
  const today = () => new Date().toISOString().slice(0, 10);

  function revealAudience() {
    if (audienceRevealed || !initialPresenceReady || !initialTotalsReady || document.hidden || away) return;
    audienceRevealed = true;
    requestAnimationFrame(() => {
      for (const widget of widgets) {
        widget.classList.remove('is-loading');
        widget.removeAttribute('aria-busy');
      }
    });
  }

  function updateAccessibleLabels() {
    const metric = metrics[metricIndex];
    const presence = onlineCount === null ? 'Online count unavailable' : `${format.format(onlineCount)} online`;
    for (const widget of widgets) {
      const { value, scope } = metricValue(widget, metric.key);
      const total = value === undefined ? `${metric.label} unavailable` : `${format.format(value)} ${metric.label.toLowerCase()} ${scope}`;
      widget.querySelector('button')!.setAttribute('aria-label', `${statistics?.scope === 'local' ? 'Local preview. ' : ''}${presence}, ${total}. Open statistics`);
    }
  }

  function metricValue(widget: HTMLElement, key: typeof metrics[number]['key']) {
    if (widget.classList.contains('visitor-game') && activity?.showProgress && !activity.solved) {
      if (key === 'connectionsCompleted') return { value: activity.connections, scope: 'in this puzzle' };
      if (key === 'dotsCleared') return { value: activity.connections * 2, scope: 'in this puzzle' };
    }
    return { value: statistics?.totals[key], scope: 'all time' };
  }
  function renderMetrics() {
    for (const widget of widgets) {
      for (const metric of metrics) {
        const counter = widget.querySelector<HTMLElement>(`.audience-${metric.key}`)!;
        const { value, scope } = metricValue(widget, metric.key);
        counter.querySelector('strong')!.textContent = value === undefined ? '—' : value >= 100_000 ? compact.format(value) : format.format(value);
        counter.title = value === undefined ? `${metric.label} are temporarily unavailable` : `${format.format(value)} ${metric.label.toLowerCase()} · ${scope}`;
        counter.classList.toggle('is-unavailable', value === undefined);
      }
      if (statistics) widget.querySelector<HTMLElement>('.visitor-scope')!.hidden = statistics.scope !== 'local';
    }
    updateAccessibleLabels();
  }
  function showMetric(key: typeof metrics[number]['key']) {
    metricIndex = metrics.findIndex(metric => metric.key === key);
    for (const widget of widgets) {
      metrics.forEach(metric => { widget.querySelector<HTMLElement>(`.audience-${metric.key}`)!.hidden = metric.key !== key; });
      if (!reducedMotion.matches) widget.querySelector(`.audience-${key} strong`)!.animate(
        [{ color: '#7966bd', transform: 'translateY(-2px)' }, { color: 'inherit', transform: 'translateY(0)' }],
        { duration: 450, easing: 'ease-out' },
      );
    }
    updateAccessibleLabels();
  }
  window.addEventListener('nodoku:puzzle-activity', event => {
    const next = (event as CustomEvent<PuzzleActivity | null>).detail;
    if (next && activity && next.attemptId === activity.attemptId
      && next.connections === activity.connections && next.solved === activity.solved) return;
    window.clearTimeout(detailTimer);
    const samePuzzle = next && next.attemptId === activity?.attemptId;
    activity = next ? { ...next, showProgress: !!samePuzzle } : null;
    renderMetrics();
    if (!activity || !samePuzzle || activity.solved) {
      showMetric('puzzlesSolved');
      return;
    }
    showMetric('connectionsCompleted');
    // Both values changed in this move: show the connection, then its cleared dots.
    // This is a single follow-up, never an idle rotation.
    detailTimer = window.setTimeout(() => showMetric('dotsCleared'), 1000);
  });
  function online(value: number | null, scope?: string) {
    onlineCount = value;
    for (const widget of widgets) {
      const counter = widget.querySelector<HTMLElement>('.audience-online')!;
      counter.querySelector('strong')!.textContent = value === null ? '—' : value >= 100_000 ? compact.format(value) : format.format(value);
      counter.classList.toggle('is-unavailable', value === null);
      counter.title = value === null ? 'Online count is temporarily unavailable' : `${format.format(value)} browsers active in the last 90 seconds`;
      if (scope && !statistics) widget.querySelector<HTMLElement>('.visitor-scope')!.hidden = scope !== 'local';
    }
    updateAccessibleLabels();
  }
  async function presence(controller: AbortController) {
    try {
      const response = await fetch('/api/presence', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ visitorId }), signal: controller.signal, cache: 'no-store' });
      const body = await response.json();
      if (!response.ok || !Number.isSafeInteger(body?.online) || body.online < 0 || !['local', 'global'].includes(body?.scope)) throw new Error('Unavailable');
      if (active === controller && !document.hidden && !away) online(body.online, body.scope);
    } catch { if (active === controller && !document.hidden && !away) online(null); }
    finally {
      initialPresenceReady = true;
      revealAudience();
    }
  }
  async function totals(controller: AbortController) {
    const registrationDay = today();
    const post = registeredDay !== registrationDay;
    // Registration precedes the totals request so a first visit is included.
    try {
      const response = await fetch('/api/visitors', { method: post ? 'POST' : 'GET', ...(post ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ visitorId }) } : {}), signal: controller.signal, cache: 'no-store' });
      const body = await response.json();
      if (response.ok && Number.isSafeInteger(body?.count) && body.count >= 0 && ['local', 'global'].includes(body?.scope) && active === controller && !document.hidden && !away) {
        registeredDay = registrationDay;
        if (post) window.dispatchEvent(new Event('nodoku:visitor-registered'));
      }
    } catch { /* Public totals can still be read while visitor registration retries. */ }
    try {
      const response = await fetch('/api/statistics?period=all', { signal: controller.signal, cache: 'no-store' });
      if (!response.ok) throw new Error('Unavailable');
      const result = parseStatistics(await response.json(), 'all');
      if (active !== controller || document.hidden || away) return;
      const changed = statistics && metrics.find(metric => result.totals[metric.key] !== statistics!.totals[metric.key]);
      statistics = result;
      statisticsUpdatedAt = Date.now();
      renderMetrics();
      if (changed && (!activity?.showProgress || activity.solved)) showMetric(changed.key);
    } catch {
      if (active === controller && !document.hidden && !away) { statistics = null; renderMetrics(); }
    } finally {
      initialTotalsReady = true;
      revealAudience();
    }
  }
  const poll = async () => {
    if (document.hidden || away || active) return;
    const controller = new AbortController();
    active = controller;
    const timeout = window.setTimeout(() => controller.abort(), 12_000);
    const requests = [presence(controller)];
    if (registeredDay !== today() || Date.now() - statisticsUpdatedAt >= STATISTICS_REFRESH_MS) requests.push(totals(controller));
    await Promise.all(requests);
    window.clearTimeout(timeout);
    if (active !== controller) return;
    active = null;
    if (!document.hidden && !away) timer = window.setTimeout(() => { void poll(); }, HEARTBEAT_MS);
  };
  const pause = () => {
    window.clearTimeout(timer);
    const pending = active;
    active = null;
    pending?.abort();
  };
  const resume = () => {
    pause();
    if (document.hidden || away) return;
    statisticsUpdatedAt = -Infinity;
    online(null);
    void poll();
  };
  document.addEventListener('visibilitychange', () => document.hidden ? pause() : resume());
  window.addEventListener('pagehide', () => { away = true; pause(); });
  window.addEventListener('pageshow', event => { if (event.persisted) { away = false; resume(); } });
  window.addEventListener('online', resume);
  window.addEventListener('nodoku:statistics-updated', resume);
  renderMetrics(); online(null);
  void poll();
}
