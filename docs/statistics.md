# Statistics

Open the rotating statistic beside Online, or visit `/#statistics`. The view preserves the current puzzle and supports browser Back/Forward. Today, 7 days and 30 days use UTC calendar days including today. All time shows every recorded achievement and the existing cumulative visitor total; its activity chart shows the last 30 days. The chart never invents data before tracking began.

## Community counts

- **Online:** unique browser IDs with a heartbeat in the last 90 seconds. Visible tabs send every 30 seconds; tabs sharing an identity count once.
- **Visitors:** distinct browser IDs in the selected period. All time includes older visitor IDs. Older visitors have no historical dates, so they appear in dated statistics only after visiting again. Daily chart values count browsers independently on each day and should not be added to calculate period-wide unique visitors.
- **Puzzles solved:** final boards verified by the server against the generated clues and connectivity rules. The first accepted completion is stored once per attempt ID and once per browser/puzzle settings and seed. Refreshing, undo/re-solving, replaying the same seed and duplicate delivery cannot add another completion.
- **Dots cleared:** the clue dots in those completed puzzles. Each completed edge accounts for two dots. Intermediate drawing, removing links, failed puzzles and the home demo do not contribute.
- **Connections completed:** final edges in the counted solved boards.
- **Popular puzzles:** counts of solved boards grouped by grid dimensions and difficulty, using the same selected period.

The browser persists an attempt ID with its game. Completion requests contain the final board, not a timeline of input actions. Failed deliveries are retained in separate `nodoku.completion.pending.v1.*` local-storage records and retried after a reload, reconnection or return to the tab. The server uses its receipt time for the completion date; offline solves appear when delivered. Clearing browser storage can remove undelivered records and gives the browser a new identity.

Local data is labeled Preview and persists in `.nodoku-data/local.sqlite`. Demos never send completion events. Automated browser tests can generate actual local counts when exercising the unmocked API. Browser-generated events are approximate community activity, not proof of a human player or a fraud-audited advertising measurement.

## Private sponsor reports

After payment is verified, the sponsorship confirmation offers a private sponsor code and a link to the placement report. Copy and retain the code. Enter it in the Statistics page's placement-report form. The code is the existing random Stripe Checkout session reference, checked against a paid sponsorship order; it cannot open another sponsor's report. Treat it as a private credential. Report requests send it in a POST body, never in a new URL or public statistics response. Ad-free purchases and pending sponsorships cannot open placement reports.

A sponsor view qualifies when at least half the actual placement card is visible for one continuous second in a visible tab, with no modal obscuring it. An intentional click also demonstrates a view. Hidden placements, placeholders, paid ad removal and background tabs do not produce views. Client tracking never blocks a sponsor link from opening.

Views and clicks each count once per sponsor, browser and UTC day. Repeated rotations, tabs and clicks therefore do not inflate that day's counts. A click requires a recorded view. **CTR** is the percentage of those daily unique views with a click (`clicks / views × 100`). These are daily unique placement measures, not raw repeated ad impressions. Period reports sum these daily counts. Reports remain available for expired paid campaigns; new events require a currently active sponsorship.

## Storage and deployment

The APIs and tables belong to the Astra implementation; the older Godot app on `origin/main` has no statistics backend. New tables are additive and preserve existing visitor totals and sponsorship orders. Restart the local Vite server to apply the schema locally. Before deploying the new APIs, initialize or update the configured D1 database using `server/schema.sql` as described in [sponsorship setup](sponsorship.md). This feature does not configure a production database or publish a deployment automatically.

- `GET /api/statistics?period=today|7d|30d|all`: public aggregate statistics.
- `POST /api/completions`: validated, deduplicated final puzzle.
- `POST /api/sponsor-events`: daily unique view/click for an active sponsor.
- `POST /api/sponsor-report`: private paid-campaign report using its code and selected period.

New dated visitor history begins with actual registrations; the client registers once per UTC day even when a tab stays open across midnight. The schema records when statistics tracking began. Missing storage or failed services show an unavailable state rather than fictional zeroes. No new external analytics provider or account is required.
