# Daily Crypto Signal Agent

A standalone Python script that gives you 3-4 daily crypto trading signals
based on technical analysis, plus a rundown of recent market news with a
rough bullish/bearish/high-impact tag.

**This is not the `message` React app** — it's a separate tool, run from
the command line (or a cron job), independent of the rest of this repo.

## What it does

- Pulls live 1-hour candles for a watchlist of coins (BTC, ETH, BNB, SOL,
  XRP, ADA, DOGE by default) from Binance's free public API — no API key
  needed.
- Scores each coin on RSI, EMA9/21 trend, MACD, Bollinger Bands, and
  volume, then prints the 3-4 strongest BUY/SELL signals with an entry,
  stop-loss, and target level.
- Pulls the latest headlines from CoinDesk and Cointelegraph RSS feeds and
  tags each one Bullish / Bearish / HIGH IMPACT based on keywords (SEC,
  ETF, Fed, hack, lawsuit, etc.).

## What it deliberately does NOT do

- **It cannot predict news that hasn't happened yet.** The "market news"
  section only summarizes headlines that have already been published —
  it flags them as high/low impact, it does not forecast the future.
- It does not guarantee any trade outcome. Treat every signal as one
  input, not financial advice. Crypto is highly volatile — size positions
  accordingly and never risk money you can't afford to lose.
- For known scheduled macro events (FOMC meetings, CPI/NFP release dates)
  that move crypto too, check a live economic calendar directly (e.g.
  forexfactory.com/calendar) — this script doesn't hardcode future dates
  since those shift and this script has no way to verify them at run time.

## Setup

```bash
cd trading-signals
pip install -r requirements.txt
```

## Usage

```bash
python signal_agent.py
```

Optional flags:

```bash
# Custom watchlist
python signal_agent.py --symbols BTCUSDT ETHUSDT SOLUSDT

# Skip the news section (faster, fewer network calls)
python signal_agent.py --no-news
```

## Running it daily

Add a cron entry to get the report every morning, e.g. 8 AM local time:

```
0 8 * * * cd /path/to/trading-signals && python3 signal_agent.py >> daily_report.log 2>&1
```

## Notes

- Binance's public API is geo-blocked in a few countries (e.g. the US).
  If requests fail there, run it through a VPN/region where Binance is
  reachable, or swap `BINANCE_BASE` in `signal_agent.py` for another
  exchange's public REST API (e.g. KuCoin, Bybit) with the same
  `open/high/low/close/volume` shape.
- All indicator math (RSI, MACD, Bollinger Bands, ATR) is implemented
  directly with pandas — no extra TA library dependency required.
