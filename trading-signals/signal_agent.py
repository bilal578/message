#!/usr/bin/env python3
"""
Daily crypto trading-signal agent.

Pulls live candles from Binance's public REST API (no key required),
scores each symbol on a handful of classic technical indicators, and
prints the 3-4 strongest signals of the day. It also pulls recent
headlines from a couple of crypto news RSS feeds and tags each one
with a rough bullish/bearish/high-impact label.

IMPORTANT — read before trusting any of this:
  * This is technical-analysis heuristics, not a crystal ball. It cannot
    predict news that hasn't happened yet, and it does not guarantee
    profit. Treat every signal as one input among many, not advice.
  * Run it on a machine with normal internet access. Binance's API is
    geo-restricted in some countries (e.g. the US) — if requests fail,
    try a VPN/region or swap in another exchange's public API.
"""

import argparse
import datetime as dt
import sys
from dataclasses import dataclass, field

import numpy as np
import pandas as pd
import requests

try:
    import feedparser
except ImportError:
    feedparser = None

BINANCE_BASE = "https://api.binance.com/api/v3"
WATCHLIST = ["BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "XRPUSDT", "ADAUSDT", "DOGEUSDT"]
KLINE_INTERVAL = "1h"
KLINE_LIMIT = 200

NEWS_FEEDS = [
    "https://www.coindesk.com/arc/outboundfeeds/rss/",
    "https://cointelegraph.com/rss",
]

BULLISH_WORDS = [
    "etf approval", "approved", "rally", "surge", "bullish", "adoption",
    "partnership", "upgrade", "inflow", "record high", "buy", "listing",
    "institutional", "halving",
]
BEARISH_WORDS = [
    "hack", "exploit", "lawsuit", "ban", "crackdown", "sec sues", "bearish",
    "sell-off", "selloff", "crash", "outflow", "delist", "fraud", "collapse",
    "liquidation", "rejected",
]
HIGH_IMPACT_WORDS = [
    "sec", "etf", "fed", "fomc", "interest rate", "cpi", "regulation",
    "regulator", "congress", "lawsuit", "hack", "halving", "etf approval",
]


@dataclass
class Signal:
    symbol: str
    direction: str
    confidence: int
    price: float
    entry: float
    stop_loss: float
    target: float
    reasons: list = field(default_factory=list)


def fetch_klines(symbol: str, interval: str = KLINE_INTERVAL, limit: int = KLINE_LIMIT) -> pd.DataFrame:
    resp = requests.get(
        f"{BINANCE_BASE}/klines",
        params={"symbol": symbol, "interval": interval, "limit": limit},
        timeout=15,
    )
    resp.raise_for_status()
    raw = resp.json()
    df = pd.DataFrame(raw, columns=[
        "open_time", "open", "high", "low", "close", "volume",
        "close_time", "quote_asset_volume", "trades",
        "taker_base_vol", "taker_quote_vol", "ignore",
    ])
    for col in ["open", "high", "low", "close", "volume"]:
        df[col] = df[col].astype(float)
    return df


def rsi(series: pd.Series, period: int = 14) -> pd.Series:
    delta = series.diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    avg_gain = gain.ewm(alpha=1 / period, min_periods=period).mean()
    avg_loss = loss.ewm(alpha=1 / period, min_periods=period).mean()
    rs = avg_gain / avg_loss.replace(0, np.nan)
    return 100 - (100 / (1 + rs))


def macd(series: pd.Series, fast: int = 12, slow: int = 26, signal: int = 9):
    ema_fast = series.ewm(span=fast, adjust=False).mean()
    ema_slow = series.ewm(span=slow, adjust=False).mean()
    macd_line = ema_fast - ema_slow
    signal_line = macd_line.ewm(span=signal, adjust=False).mean()
    return macd_line, signal_line


def atr(df: pd.DataFrame, period: int = 14) -> pd.Series:
    high, low, close = df["high"], df["low"], df["close"]
    prev_close = close.shift(1)
    tr = pd.concat([
        high - low,
        (high - prev_close).abs(),
        (low - prev_close).abs(),
    ], axis=1).max(axis=1)
    return tr.ewm(alpha=1 / period, min_periods=period).mean()


def compute_indicators(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df["ema9"] = df["close"].ewm(span=9, adjust=False).mean()
    df["ema21"] = df["close"].ewm(span=21, adjust=False).mean()
    df["rsi14"] = rsi(df["close"])
    df["macd"], df["macd_signal"] = macd(df["close"])
    df["bb_mid"] = df["close"].rolling(20).mean()
    df["bb_std"] = df["close"].rolling(20).std()
    df["bb_upper"] = df["bb_mid"] + 2 * df["bb_std"]
    df["bb_lower"] = df["bb_mid"] - 2 * df["bb_std"]
    df["atr14"] = atr(df)
    df["vol_avg"] = df["volume"].rolling(20).mean()
    return df


def generate_signal(symbol: str, df: pd.DataFrame) -> Signal:
    last = df.iloc[-1]
    score = 0
    reasons = []

    if last["rsi14"] < 30:
        score += 1
        reasons.append(f"RSI {last['rsi14']:.0f} oversold")
    elif last["rsi14"] > 70:
        score -= 1
        reasons.append(f"RSI {last['rsi14']:.0f} overbought")

    if last["ema9"] > last["ema21"]:
        score += 1
        reasons.append("EMA9 above EMA21 (uptrend)")
    else:
        score -= 1
        reasons.append("EMA9 below EMA21 (downtrend)")

    if last["macd"] > last["macd_signal"]:
        score += 1
        reasons.append("MACD above signal line")
    else:
        score -= 1
        reasons.append("MACD below signal line")

    if last["close"] <= last["bb_lower"]:
        score += 1
        reasons.append("Price at/below lower Bollinger Band")
    elif last["close"] >= last["bb_upper"]:
        score -= 1
        reasons.append("Price at/above upper Bollinger Band")

    if last["volume"] > 1.3 * last["vol_avg"]:
        reasons.append("Volume spike (confirms move)")
        score += 1 if score > 0 else (-1 if score < 0 else 0)

    if score >= 2:
        direction = "BUY"
    elif score <= -2:
        direction = "SELL"
    else:
        direction = "NEUTRAL"

    confidence = min(100, int(abs(score) / 5 * 100))
    price = last["close"]
    atr_val = last["atr14"] if not np.isnan(last["atr14"]) else price * 0.01

    if direction == "BUY":
        stop_loss = price - 1.5 * atr_val
        target = price + 2.5 * atr_val
    elif direction == "SELL":
        stop_loss = price + 1.5 * atr_val
        target = price - 2.5 * atr_val
    else:
        stop_loss = target = price

    return Signal(symbol, direction, confidence, price, price, stop_loss, target, reasons)


def build_signals(watchlist=WATCHLIST) -> list:
    signals = []
    for symbol in watchlist:
        try:
            df = compute_indicators(fetch_klines(symbol))
            signals.append(generate_signal(symbol, df))
        except Exception as exc:  # noqa: BLE001 - report and keep going
            print(f"  [warn] {symbol}: could not fetch/analyze ({exc})", file=sys.stderr)
    non_neutral = [s for s in signals if s.direction != "NEUTRAL"]
    non_neutral.sort(key=lambda s: s.confidence, reverse=True)
    top = non_neutral[:4]
    if len(top) < 3:
        rest = [s for s in signals if s not in top]
        rest.sort(key=lambda s: s.confidence, reverse=True)
        top += rest[: 3 - len(top)]
    return top


def tag_news(headline: str) -> list:
    tags = []
    lower = headline.lower()
    if any(word in lower for word in BULLISH_WORDS):
        tags.append("Bullish bias")
    if any(word in lower for word in BEARISH_WORDS):
        tags.append("Bearish bias")
    if any(word in lower for word in HIGH_IMPACT_WORDS):
        tags.append("HIGH IMPACT")
    return tags or ["Neutral"]


def fetch_news(limit: int = 8) -> list:
    if feedparser is None:
        return []
    items = []
    for url in NEWS_FEEDS:
        try:
            parsed = feedparser.parse(url)
            for entry in parsed.entries[:limit]:
                items.append({
                    "title": entry.get("title", ""),
                    "link": entry.get("link", ""),
                    "published": entry.get("published", ""),
                    "tags": tag_news(entry.get("title", "")),
                })
        except Exception as exc:  # noqa: BLE001
            print(f"  [warn] could not read feed {url}: {exc}", file=sys.stderr)
    return items[:limit]


def print_report(signals: list, news: list):
    today = dt.date.today().isoformat()
    print("=" * 60)
    print(f"  DAILY CRYPTO SIGNAL REPORT — {today}")
    print("=" * 60)
    print("\nDISCLAIMER: Educational use only, not financial advice.")
    print("Signals are technical-analysis heuristics on 1h candles;")
    print("they do not predict unreleased news or guarantee outcomes.\n")

    print(f"--- Top {len(signals)} Signals ---\n")
    for s in signals:
        print(f"{s.symbol}: {s.direction}  (confidence {s.confidence}%)")
        print(f"  Price:     {s.price:,.4f}")
        if s.direction != "NEUTRAL":
            print(f"  Entry:     {s.entry:,.4f}")
            print(f"  Stop-loss: {s.stop_loss:,.4f}")
            print(f"  Target:    {s.target:,.4f}")
        print(f"  Why:       {'; '.join(s.reasons)}")
        print()

    print("--- Market News & Possible Impact ---\n")
    if not news:
        print("  (news fetch unavailable — install feedparser and check network access)\n")
    for item in news:
        tags = ", ".join(item["tags"])
        print(f"  [{tags}] {item['title']}")
        if item["link"]:
            print(f"    {item['link']}")
    print()
    print("Note: this lists already-published headlines with a rough")
    print("keyword-based bias/impact tag — it is not a forecast of news")
    print("that hasn't happened yet. For scheduled macro events (Fed")
    print("meetings, CPI releases, jobs reports) check an economic")
    print("calendar (e.g. forexfactory.com/calendar) directly, since")
    print("exact future dates aren't something this script can verify.")
    print("=" * 60)


def main():
    parser = argparse.ArgumentParser(description="Daily crypto trading-signal agent")
    parser.add_argument("--symbols", nargs="*", default=WATCHLIST, help="Override the watchlist")
    parser.add_argument("--no-news", action="store_true", help="Skip the news section")
    args = parser.parse_args()

    signals = build_signals(args.symbols)
    news = [] if args.no_news else fetch_news()
    print_report(signals, news)


if __name__ == "__main__":
    main()
