# token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Pasletik/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Pasletik/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar: it reads a sealed DefiLlama snapshot, ranks the pre-token protocols by an implied value, and hands in a web dashboard with the board, a detail view per protocol, and the steps to farm each one.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <kit>/input/snapshot.json
node tests/gate-check.mjs out
```

Reads `/input/snapshot.json` (or `--input`), writes `/output/board.json`, `/output/data.js`, copies `dashboard/` and `screenshots/` to `/output`, writes `/output/dossier.json`. Then serve `out/` locally and take the screenshots with `scripts/shots.sh`.

## Layout

- `main.ts` — the program (Node 22, stdlib only).
- `lib/model.ts` — the radar-2 model: comparables valuation, rankable filter, farm plans, board validation, data script.
- `dashboard/` — the static page: `index.html`, `app.css`, `app.js`. No network.
- `vendor/makefun-board.ts` — make.fun's dossier library, byte for byte the kit's copy (the scorer runs the same file).
- `screenshots/` — the three screenshots: board, detail view, filtered view.
- `tests/gate-check.mjs` — a local mirror of the sealed gate's seven rows.
- `scripts/shots.sh` — renders the dashboard in headless Chromium and takes the three screenshots.

## The model (radar-2)

Implied value is a comparables valuation computed from the snapshot's own live protocols — no hardcoded names, no hand-picked rows:

```
catMultiple  = median market-cap-per-TVL of the live protocols in the row's
               category, winsorized to [0.02, 1.00] and shrunk toward the whole
               market's median with a weight of 5
growthMult   = 1 + clamp(change_7d, -50, 100) / 100 x 0.5
maturityMult = 0.7 + min(age_days, 1095) / 1095 x 0.3   (age unknown: 365 days)
breadthMult  = 1 + 0.04 x (min(chains, 6) - 1)
implied      = max(1, round(tvl_usd x catMultiple x growthMult x maturityMult x breadthMult))
```

The board covers every watchlist slug plus every other pre-token protocol the exclusion rule keeps (not a wrapped, staked or bridged product of a traded token, not an exchange, not a versioned pool). Live-token protocols are set aside with their market caps shown, and double as the comparables the model prices with.

## Verify

- `node tests/gate-check.mjs out` mirrors the gate: dashboard files and the no-network rule, board rows and slugs, ranks and implied values, watchlist coverage, farm steps, screenshot sizes and dimensions, dossier byte-equality.
- The run is deterministic: two runs on the same snapshot write the same bytes.

---

<sub>Entered on [make.fun](https://make.fun/?ref=fdvwjd8e&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
