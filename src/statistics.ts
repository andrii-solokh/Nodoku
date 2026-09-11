import './statistics.css';

export type StatisticsPeriod = 'today' | '7d' | '30d' | 'all';
type ActivityMetric = 'puzzlesSolved' | 'visitors' | 'dotsCleared';
export interface StatisticsData {
  scope: 'local' | 'global';
  period: StatisticsPeriod;
  trackingSince: string;
  totals: Record<ActivityMetric | 'connectionsCompleted', number>;
  daily: { date: string; visitors: number; puzzlesSolved: number; dotsCleared: number }[];
  sizes: { size: number; depth: number; count: number }[];
  difficulties: { difficulty: 'easy' | 'medium' | 'hard'; count: number }[];
}
const count = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object';
const day = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value));
export function parseStatistics(value: unknown, period: StatisticsPeriod): StatisticsData {
  if (!record(value) || value.period !== period || !['local', 'global'].includes(String(value.scope)) ||
    typeof value.trackingSince !== 'string' || !Number.isFinite(Date.parse(value.trackingSince)) || !record(value.totals) ||
    !['visitors', 'puzzlesSolved', 'dotsCleared', 'connectionsCompleted'].every(key => count((value.totals as Record<string, unknown>)[key])) ||
    !Array.isArray(value.daily) || !value.daily.every(row => record(row) && day(row.date) && count(row.visitors) && count(row.puzzlesSolved) && count(row.dotsCleared)) ||
    !Array.isArray(value.sizes) || !value.sizes.every(row => record(row) && Number.isInteger(row.size) && Number(row.size) >= 3 && Number(row.size) <= 7 && (row.depth === 1 || row.depth === row.size) && count(row.count)) ||
    !Array.isArray(value.difficulties) || !value.difficulties.every(row => record(row) && ['easy', 'medium', 'hard'].includes(String(row.difficulty)) && count(row.count))) {
    throw new Error('Statistics are temporarily unavailable.');
  }
  return value as unknown as StatisticsData;
}
const format = new Intl.NumberFormat();
const periodLabels: Record<StatisticsPeriod, string> = { today: 'Today', '7d': '7 days', '30d': '30 days', all: 'All time' };
const metricLabels: Record<ActivityMetric, string> = { puzzlesSolved: 'Puzzles solved', visitors: 'Visitors', dotsCleared: 'Dots cleared' };
let openPage: ((options?: { report?: boolean }) => void) | undefined;
export function openStatistics(options?: { report?: boolean }): void { openPage?.(options); }

export function mountStatistics(options: { beforeOpen?: () => void } = {}): void {
  if (document.getElementById('statistics-dialog')) return;
  const dialog = document.createElement('dialog');
  dialog.id = 'statistics-dialog';
  dialog.className = 'statistics-page';
  dialog.setAttribute('aria-labelledby', 'statistics-title');
  dialog.innerHTML = `
    <div class="statistics-shell">
      <header class="statistics-header"><button id="statistics-close" class="statistics-back" autofocus><span aria-hidden="true">←</span> <span>Back to game</span></button><span class="statistics-wordmark">nodoku <i aria-hidden="true"></i></span></header>
      <div class="statistics-intro"><p class="statistics-eyebrow">A world of little connections <span id="statistics-scope" hidden>Local preview</span></p><h1 id="statistics-title">Every dot adds up.</h1><p>A shared look at the puzzles we have brought together.</p></div>
      <nav class="statistics-periods" aria-label="Statistics period">${Object.entries(periodLabels).map(([value, label]) => `<button type="button" data-period="${value}" aria-pressed="${value === '30d'}">${label}</button>`).join('')}</nav>
      <div class="statistics-status" id="statistics-status" role="status" aria-live="polite"></div><button class="statistics-retry" id="statistics-retry" hidden>Try again</button>
      <div id="statistics-content" hidden>
        <div class="statistics-totals">${[['puzzlesSolved', 'Puzzles solved'], ['dotsCleared', 'Dots cleared'], ['visitors', 'Visitors'], ['connectionsCompleted', 'Connections completed']].map(([key, label]) => `<article class="statistics-total"><strong data-total="${key}">—</strong><span>${label}</span></article>`).join('')}</div>
        <section class="statistics-panel statistics-activity" aria-labelledby="statistics-activity-title"><div class="statistics-panel-heading"><div><p class="statistics-eyebrow">One day at a time</p><h2 id="statistics-activity-title">Daily activity</h2></div><label class="statistics-metric-label">Show <select id="statistics-metric">${Object.entries(metricLabels).map(([key, label]) => `<option value="${key}">${label}</option>`).join('')}</select></label></div><p id="statistics-chart-note"></p><div id="statistics-chart" class="statistics-chart" role="group" aria-label="Daily activity chart"></div><div class="statistics-chart-axis"><span id="statistics-chart-first"></span><output id="statistics-chart-value" aria-live="polite"></output><span id="statistics-chart-last"></span></div><p id="statistics-chart-empty" hidden>No activity recorded in this period yet. Your next little victory can be the first.</p><details class="statistics-daily-details"><summary>Daily values</summary><div class="statistics-table-wrap"><table><caption class="sr-only">Daily activity values</caption><thead><tr><th>Date (UTC)</th><th>Puzzles</th><th>Visitors</th><th>Dots</th></tr></thead><tbody id="statistics-daily-values"></tbody></table></div></details></section>
        <div class="statistics-breakdowns"><section class="statistics-panel"><p class="statistics-eyebrow">Ways to play</p><h2>Popular grids</h2><ul id="statistics-sizes" class="statistics-ranking"></ul></section><section class="statistics-panel"><p class="statistics-eyebrow">Finding a pace</p><h2>Popular difficulties</h2><ul id="statistics-difficulties" class="statistics-ranking"></ul></section></div>
        <p id="statistics-tracking" class="statistics-tracking"></p>
      </div>
      <details class="statistics-definitions"><summary>What these numbers mean</summary><dl><dt>Online</dt><dd>Browsers active in the last 90 seconds. Multiple tabs in the same browser count once.</dd><dt>Visitors</dt><dd>Unique browsers seen during the selected period. All time also includes visits recorded before daily tracking began.</dd><dt>Puzzles solved</dt><dd>Completed, connected puzzles, counted once per game attempt. Demo puzzles are excluded; puzzles completed with hints are included.</dd><dt>Dots cleared & connections completed</dt><dd>The dots and final connections in those completed puzzles. Drawing, removing, or replaying a connection does not add extra totals.</dd><dt>Dates</dt><dd>Days begin at midnight UTC. Local preview figures belong to this preview and are separate from live site activity.</dd></dl></details>
      <section id="statistics-report" class="statistics-panel statistics-report" aria-labelledby="statistics-report-title"><div><p class="statistics-eyebrow">For our supporters</p><h2 id="statistics-report-title">Your placement report</h2><p>Enter the sponsor code from your purchase confirmation to see your placement’s results.</p></div><form id="statistics-report-form"><label for="statistics-report-code">Sponsor code</label><div class="statistics-report-entry"><input id="statistics-report-code" name="receipt" type="password" autocomplete="off" spellcheck="false" required placeholder="Your private sponsor code"><button class="statistics-report-submit" type="submit">View report</button></div><p class="statistics-private-note">Your code stays out of the page address and is cleared when you leave statistics.</p></form><p id="statistics-report-status" role="status" aria-live="polite"></p><div id="statistics-report-result" hidden><h3 id="statistics-report-brand"></h3><p id="statistics-report-period"></p><div class="statistics-report-totals"><div><strong data-report="views">—</strong><span>Views</span></div><div><strong data-report="clicks">—</strong><span>Clicks</span></div><div><strong data-report="ctr">—</strong><span>Click-through rate</span></div></div><details><summary>Daily placement results</summary><div class="statistics-table-wrap"><table><thead><tr><th>Date (UTC)</th><th>Views</th><th>Clicks</th></tr></thead><tbody id="statistics-report-daily"></tbody></table></div></details><p class="statistics-private-note">Views and clicks count each browser once per UTC day. A click counts only after a qualifying view.</p></div></section>
    </div>`;
  document.body.appendChild(dialog);
  const el = <T extends HTMLElement = HTMLElement>(id: string) => dialog.querySelector<T>(`#${id}`)!;
  let period: StatisticsPeriod = '30d';
  let metric: ActivityMetric = 'puzzlesSolved';
  let data: StatisticsData | null = null;
  let active: AbortController | null = null;
  let reportActive: AbortController | null = null;
  let reportReceipt = '';
  let returnFocus: HTMLElement | null = null;
  let previousHash = '';

  const dateLabel = (date: string) => new Date(`${date.slice(0, 10)}T00:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
  function renderChart() {
    if (!data) return;
    const daily = data.daily;
    const chart = el('statistics-chart');
    chart.replaceChildren();
    chart.style.setProperty('--days', String(Math.max(1, daily.length)));
    const max = Math.max(1, ...daily.map(row => row[metric]));
    const output = el<HTMLOutputElement>('statistics-chart-value');
    output.textContent = '';
    for (const row of daily) {
      const bar = document.createElement('button');
      bar.type = 'button';
      bar.className = 'statistics-bar';
      bar.style.setProperty('--bar-height', `${row[metric] / max * 100}%`);
      bar.setAttribute('aria-label', `${dateLabel(row.date)}: ${format.format(row[metric])} ${metricLabels[metric].toLowerCase()}`);
      bar.title = bar.getAttribute('aria-label')!;
      const fill = document.createElement('span');
      fill.setAttribute('aria-hidden', 'true');
      bar.appendChild(fill);
      const show = () => { output.textContent = `${dateLabel(row.date)} · ${format.format(row[metric])}`; };
      bar.addEventListener('pointerenter', show);
      bar.addEventListener('focus', show);
      bar.addEventListener('click', show);
      chart.appendChild(bar);
    }
    el('statistics-chart-empty').hidden = daily.some(row => row[metric] > 0);
    el('statistics-chart-first').textContent = daily.length ? dateLabel(daily[0].date) : '';
    el('statistics-chart-last').textContent = daily.length > 1 ? dateLabel(daily.at(-1)!.date) : '';
    el('statistics-chart-note').textContent = period === 'all' ? 'All-time totals above. The chart shows the last 30 days, in UTC.' : `${periodLabels[period]} · ${metricLabels[metric].toLowerCase()} per day, in UTC.`;
  }
  function ranking(id: string, entries: { label: string; count: number }[]) {
    const list = el(id);
    list.replaceChildren();
    if (!entries.some(entry => entry.count > 0)) {
      const empty = document.createElement('li');
      empty.className = 'statistics-empty';
      empty.textContent = 'No completed puzzles in this period yet.';
      list.appendChild(empty);
      return;
    }
    for (const entry of [...entries].sort((a, b) => b.count - a.count)) {
      const row = document.createElement('li');
      const label = document.createElement('span');
      label.textContent = entry.label;
      const value = document.createElement('strong');
      value.textContent = format.format(entry.count);
      row.append(label, value);
      list.appendChild(row);
    }
  }
  function render() {
    if (!data) return;
    for (const element of dialog.querySelectorAll<HTMLElement>('[data-total]')) element.textContent = format.format(data.totals[element.dataset.total as keyof StatisticsData['totals']]);
    el('statistics-scope').hidden = data.scope !== 'local';
    el('statistics-tracking').textContent = `Daily tracking began ${dateLabel(data.trackingSince)}. Earlier visitors appear only in the all-time visitor total.`;
    ranking('statistics-sizes', data.sizes.map(row => ({ label: `${row.size} × ${row.size}${row.depth === 1 ? ' · Flat' : ` × ${row.depth}`}`, count: row.count })));
    const labels = { easy: 'Gentle', medium: 'Focused', hard: 'Intricate' };
    ranking('statistics-difficulties', data.difficulties.map(row => ({ label: labels[row.difficulty], count: row.count })));
    const body = el('statistics-daily-values');
    body.replaceChildren();
    for (const row of data.daily) {
      const tr = document.createElement('tr');
      for (const value of [row.date, format.format(row.puzzlesSolved), format.format(row.visitors), format.format(row.dotsCleared)]) { const td = document.createElement('td'); td.textContent = value; tr.appendChild(td); }
      body.appendChild(tr);
    }
    renderChart();
  }
  async function load() {
    active?.abort();
    const controller = new AbortController();
    active = controller;
    const timeout = window.setTimeout(() => controller.abort(), 12000);
    el('statistics-status').textContent = 'Gathering the little victories…';
    el('statistics-retry').hidden = true;
    el('statistics-content').hidden = true;
    data = null;
    try {
      const response = await fetch(`/api/statistics?period=${period}`, { cache: 'no-store', signal: controller.signal });
      if (!response.ok) throw new Error('Unavailable');
      const result = parseStatistics(await response.json(), period);
      if (active !== controller || !dialog.open) return;
      data = result;
      render();
      el('statistics-status').textContent = '';
      el('statistics-content').hidden = false;
    } catch {
      if (active !== controller || !dialog.open) return;
      el('statistics-status').textContent = 'Statistics are temporarily unavailable. Please try again.';
      el('statistics-retry').hidden = false;
    } finally { window.clearTimeout(timeout); if (active === controller) active = null; }
  }
  async function loadReport() {
    reportActive?.abort();
    const controller = new AbortController();
    reportActive = controller;
    const timeout = window.setTimeout(() => controller.abort(), 12000);
    el('statistics-report-result').hidden = true;
    el('statistics-report-status').textContent = 'Checking your placement…';
    const submit = dialog.querySelector<HTMLButtonElement>('.statistics-report-submit')!;
    submit.disabled = true;
    try {
      const response = await fetch('/api/sponsor-report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ receipt: reportReceipt, period }), cache: 'no-store', signal: controller.signal });
      const result: unknown = await response.json();
      if (!response.ok || !record(result) || typeof result.brand !== 'string' || result.period !== period || !record(result.totals) || !count(result.totals.views) || !count(result.totals.clicks) || typeof result.totals.ctr !== 'number' || !Number.isFinite(result.totals.ctr) || result.totals.ctr < 0 || result.totals.ctr > 100 || !Array.isArray(result.daily) || !result.daily.every(row => record(row) && day(row.date) && count(row.views) && count(row.clicks))) throw new Error('Unavailable');
      if (reportActive !== controller || !dialog.open) return;
      el('statistics-report-brand').textContent = result.brand;
      el('statistics-report-period').textContent = `${periodLabels[period]} · Private placement results`;
      for (const key of ['views', 'clicks', 'ctr']) dialog.querySelector<HTMLElement>(`[data-report="${key}"]`)!.textContent = key === 'ctr' ? `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(result.totals.ctr)}%` : format.format(result.totals[key] as number);
      const body = el('statistics-report-daily'); body.replaceChildren();
      for (const row of result.daily) { const tr = document.createElement('tr'); for (const value of [row.date, format.format(row.views), format.format(row.clicks)]) { const td = document.createElement('td'); td.textContent = value; tr.appendChild(td); } body.appendChild(tr); }
      el('statistics-report-status').textContent = result.totals.views === 0 ? 'No qualifying views have been recorded for this period yet.' : '';
      el('statistics-report-result').hidden = false;
    } catch {
      if (reportActive === controller && dialog.open) el('statistics-report-status').textContent = 'We could not load that report. Check your sponsor code and try again.';
    } finally { window.clearTimeout(timeout); if (reportActive === controller) { reportActive = null; submit.disabled = false; } }
  }
  function show(report = false) {
    if (!dialog.open) {
      returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      options.beforeOpen?.();
      el('statistics-close').querySelector('span:last-child')!.textContent = document.querySelector('#app.playing') ? 'Back to game' : 'Back to Nodoku';
      dialog.showModal();
      dialog.scrollTop = 0;
      void load();
    }
    if (report) { el('statistics-report').scrollIntoView(); el<HTMLInputElement>('statistics-report-code').focus(); }
  }
  function syncLocation() {
    if (location.hash === '#statistics') show();
    else if (dialog.open) dialog.close();
  }
  openPage = ({ report = false } = {}) => {
    if (location.hash !== '#statistics') {
      previousHash = location.hash;
      history.pushState({ ...history.state, nodokuStatistics: true }, '', '#statistics');
    }
    show(report);
  };
  function leave() {
    if (history.state?.nodokuStatistics) history.back();
    else { history.replaceState(history.state, '', location.pathname + location.search + previousHash); dialog.close(); }
  }
  function clearReport() {
    reportActive?.abort(); reportActive = null; reportReceipt = '';
    el<HTMLInputElement>('statistics-report-code').value = '';
    el('statistics-report-result').hidden = true;
    el('statistics-report-status').textContent = '';
    el('statistics-report-brand').textContent = '';
    el('statistics-report-period').textContent = '';
    el('statistics-report-daily').replaceChildren();
    for (const value of dialog.querySelectorAll('[data-report]')) value.textContent = '—';
    dialog.querySelector<HTMLButtonElement>('.statistics-report-submit')!.disabled = false;
  }
  el('statistics-close').addEventListener('click', leave);
  dialog.addEventListener('cancel', event => { event.preventDefault(); leave(); });
  dialog.addEventListener('close', () => {
    active?.abort(); active = null;
    clearReport();
    if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
  });
  for (const button of dialog.querySelectorAll<HTMLButtonElement>('[data-period]')) button.addEventListener('click', () => {
    period = button.dataset.period as StatisticsPeriod;
    for (const candidate of dialog.querySelectorAll('[data-period]')) candidate.setAttribute('aria-pressed', String(candidate === button));
    void load(); if (reportReceipt) void loadReport();
  });
  el<HTMLSelectElement>('statistics-metric').addEventListener('change', event => { metric = (event.target as HTMLSelectElement).value as ActivityMetric; renderChart(); });
  el('statistics-retry').addEventListener('click', () => void load());
  el('statistics-report-form').addEventListener('submit', event => { event.preventDefault(); reportReceipt = el<HTMLInputElement>('statistics-report-code').value.trim(); if (reportReceipt) void loadReport(); });
  window.addEventListener('popstate', syncLocation);
  window.addEventListener('hashchange', syncLocation);
  window.addEventListener('pagehide', () => { active?.abort(); active = null; clearReport(); });
  window.addEventListener('pageshow', event => { if (event.persisted && dialog.open) void load(); });
  window.addEventListener('nodoku:statistics-updated', () => { if (dialog.open) void load(); });
  window.addEventListener('nodoku:visitor-registered', () => { if (dialog.open) void load(); });
  if (location.hash === '#statistics') show();
}
