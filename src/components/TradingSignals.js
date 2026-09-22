import React, { useEffect, useState, useCallback } from 'react'

// Client-side crypto trading-signal dashboard.
// Calls Binance's public REST API directly from the browser (no backend,
// no API key) for price candles, and CryptoCompare's free public news API
// for headlines. Both run entirely in the visitor's browser once deployed,
// so this only works where those hosts are reachable (not in a sandboxed
// dev container with restricted egress).

const BINANCE_KLINES = 'https://api.binance.com/api/v3/klines'
const NEWS_API = 'https://min-api.cryptocompare.com/data/v2/news/?lang=EN'
const WATCHLIST = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT', 'ADAUSDT', 'DOGEUSDT']
const REFRESH_MS = 5 * 60 * 1000

const BULLISH_WORDS = ['etf approval', 'approved', 'rally', 'surge', 'bullish', 'adoption', 'partnership', 'upgrade', 'inflow', 'record high', 'listing', 'institutional', 'halving']
const BEARISH_WORDS = ['hack', 'exploit', 'lawsuit', 'ban', 'crackdown', 'sec sues', 'bearish', 'sell-off', 'selloff', 'crash', 'outflow', 'delist', 'fraud', 'collapse', 'liquidation', 'rejected']
const HIGH_IMPACT_WORDS = ['sec', 'etf', 'fed', 'fomc', 'interest rate', 'cpi', 'regulation', 'regulator', 'congress', 'lawsuit', 'hack', 'halving']

function ema(values, period) {
    const k = 2 / (period + 1)
    const out = new Array(values.length).fill(null)
    let prev = values[0]
    out[0] = prev
    for (let i = 1; i < values.length; i++) {
        prev = values[i] * k + prev * (1 - k)
        out[i] = prev
    }
    return out
}

function rsi(closes, period = 14) {
    const out = new Array(closes.length).fill(null)
    let avgGain = 0
    let avgLoss = 0
    for (let i = 1; i < closes.length; i++) {
        const change = closes[i] - closes[i - 1]
        const gain = Math.max(change, 0)
        const loss = Math.max(-change, 0)
        if (i <= period) {
            avgGain += gain / period
            avgLoss += loss / period
        } else {
            avgGain = (avgGain * (period - 1) + gain) / period
            avgLoss = (avgLoss * (period - 1) + loss) / period
        }
        if (i >= period) {
            const rs = avgLoss === 0 ? 100 : avgGain / avgLoss
            out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + rs)
        }
    }
    return out
}

function macd(closes) {
    const emaFast = ema(closes, 12)
    const emaSlow = ema(closes, 26)
    const macdLine = closes.map((_, i) => emaFast[i] - emaSlow[i])
    const signalLine = ema(macdLine, 9)
    return { macdLine, signalLine }
}

function bollinger(closes, period = 20) {
    const upper = new Array(closes.length).fill(null)
    const lower = new Array(closes.length).fill(null)
    for (let i = period - 1; i < closes.length; i++) {
        const slice = closes.slice(i - period + 1, i + 1)
        const mean = slice.reduce((a, b) => a + b, 0) / period
        const variance = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / period
        const std = Math.sqrt(variance)
        upper[i] = mean + 2 * std
        lower[i] = mean - 2 * std
    }
    return { upper, lower }
}

function atr(highs, lows, closes, period = 14) {
    const tr = highs.map((h, i) => {
        if (i === 0) return h - lows[i]
        return Math.max(h - lows[i], Math.abs(h - closes[i - 1]), Math.abs(lows[i] - closes[i - 1]))
    })
    return ema(tr, period)
}

async function fetchKlines(symbol) {
    const url = `${BINANCE_KLINES}?symbol=${symbol}&interval=1h&limit=200`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const raw = await res.json()
    return {
        opens: raw.map(k => parseFloat(k[1])),
        highs: raw.map(k => parseFloat(k[2])),
        lows: raw.map(k => parseFloat(k[3])),
        closes: raw.map(k => parseFloat(k[4])),
        volumes: raw.map(k => parseFloat(k[5])),
    }
}

function generateSignal(symbol, candles) {
    const { highs, lows, closes, volumes } = candles
    const i = closes.length - 1
    const rsiArr = rsi(closes)
    const emaFast = ema(closes, 9)
    const emaSlow = ema(closes, 21)
    const { macdLine, signalLine } = macd(closes)
    const { upper, lower } = bollinger(closes)
    const atrArr = atr(highs, lows, closes)
    const volAvg = volumes.slice(Math.max(0, i - 19), i + 1).reduce((a, b) => a + b, 0) / Math.min(20, i + 1)

    let score = 0
    const reasons = []
    const rsiVal = rsiArr[i]

    if (rsiVal !== null) {
        if (rsiVal < 30) { score += 1; reasons.push(`RSI ${rsiVal.toFixed(0)} oversold`) }
        else if (rsiVal > 70) { score -= 1; reasons.push(`RSI ${rsiVal.toFixed(0)} overbought`) }
    }
    if (emaFast[i] > emaSlow[i]) { score += 1; reasons.push('EMA9 above EMA21 (uptrend)') }
    else { score -= 1; reasons.push('EMA9 below EMA21 (downtrend)') }

    if (macdLine[i] > signalLine[i]) { score += 1; reasons.push('MACD above signal line') }
    else { score -= 1; reasons.push('MACD below signal line') }

    if (lower[i] !== null && closes[i] <= lower[i]) { score += 1; reasons.push('Price at/below lower Bollinger Band') }
    else if (upper[i] !== null && closes[i] >= upper[i]) { score -= 1; reasons.push('Price at/above upper Bollinger Band') }

    if (volumes[i] > 1.3 * volAvg) {
        reasons.push('Volume spike (confirms move)')
        score += score > 0 ? 1 : score < 0 ? -1 : 0
    }

    const direction = score >= 2 ? 'BUY' : score <= -2 ? 'SELL' : 'NEUTRAL'
    const confidence = Math.min(100, Math.round((Math.abs(score) / 5) * 100))
    const price = closes[i]
    const atrVal = atrArr[i] || price * 0.01

    let stopLoss = price
    let target = price
    if (direction === 'BUY') { stopLoss = price - 1.5 * atrVal; target = price + 2.5 * atrVal }
    else if (direction === 'SELL') { stopLoss = price + 1.5 * atrVal; target = price - 2.5 * atrVal }

    return { symbol, direction, confidence, price, stopLoss, target, reasons }
}

function tagNews(text) {
    const lower = text.toLowerCase()
    const tags = []
    if (BULLISH_WORDS.some(w => lower.includes(w))) tags.push('Bullish bias')
    if (BEARISH_WORDS.some(w => lower.includes(w))) tags.push('Bearish bias')
    if (HIGH_IMPACT_WORDS.some(w => lower.includes(w))) tags.push('HIGH IMPACT')
    return tags.length ? tags : ['Neutral']
}

function formatNumber(n) {
    if (n === undefined || n === null || Number.isNaN(n)) return '-'
    return n >= 1 ? n.toFixed(2) : n.toPrecision(4)
}

const TradingSignals = () => {
    const [signals, setSignals] = useState([])
    const [news, setNews] = useState([])
    const [loading, setLoading] = useState(true)
    const [signalsError, setSignalsError] = useState(null)
    const [newsError, setNewsError] = useState(null)
    const [lastUpdated, setLastUpdated] = useState(null)

    const loadSignals = useCallback(async () => {
        const results = await Promise.allSettled(
            WATCHLIST.map(async symbol => generateSignal(symbol, await fetchKlines(symbol)))
        )
        const ok = results.filter(r => r.status === 'fulfilled').map(r => r.value)
        if (ok.length === 0) {
            setSignalsError('Could not reach Binance from this browser (network/CORS blocked). Try again from a normal internet connection.')
            setSignals([])
            return
        }
        setSignalsError(null)
        const nonNeutral = ok.filter(s => s.direction !== 'NEUTRAL').sort((a, b) => b.confidence - a.confidence)
        let top = nonNeutral.slice(0, 4)
        if (top.length < 3) {
            const rest = ok.filter(s => !top.includes(s)).sort((a, b) => b.confidence - a.confidence)
            top = top.concat(rest.slice(0, 3 - top.length))
        }
        setSignals(top)
    }, [])

    const loadNews = useCallback(async () => {
        try {
            const res = await fetch(NEWS_API)
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            const data = await res.json()
            const items = (data.Data || []).slice(0, 8).map(item => ({
                title: item.title,
                url: item.url,
                source: item.source_info?.name || item.source,
                tags: tagNews(`${item.title} ${item.body || ''}`),
            }))
            setNewsError(null)
            setNews(items)
        } catch (e) {
            setNewsError('Could not reach the news API from this browser (network/CORS blocked).')
            setNews([])
        }
    }, [])

    const loadAll = useCallback(async () => {
        setLoading(true)
        await Promise.all([loadSignals(), loadNews()])
        setLastUpdated(new Date())
        setLoading(false)
    }, [loadSignals, loadNews])

    useEffect(() => {
        loadAll()
        const id = setInterval(loadAll, REFRESH_MS)
        return () => clearInterval(id)
    }, [loadAll])

    return (
        <div className="signals">
            <div className="signals__header">
                <h1>Daily Crypto Signals</h1>
                <button className="signals__refresh" onClick={loadAll} disabled={loading}>
                    {loading ? 'Refreshing...' : 'Refresh'}
                </button>
            </div>

            <p className="signals__disclaimer">
                Educational use only, not financial advice. Signals are technical-analysis
                heuristics on 1h candles — they do not predict unreleased news and do not
                guarantee any outcome. Crypto is highly volatile; never risk money you can't
                afford to lose.
            </p>

            {lastUpdated && (
                <p className="signals__updated">Last updated: {lastUpdated.toLocaleTimeString()}</p>
            )}

            <h2>Top Signals</h2>
            {signalsError && <p className="signals__error">{signalsError}</p>}
            <div className="signals__grid">
                {signals.map(s => (
                    <div key={s.symbol} className={`signals__card signals__card--${s.direction.toLowerCase()}`}>
                        <div className="signals__card-head">
                            <span className="signals__symbol">{s.symbol}</span>
                            <span className={`signals__badge signals__badge--${s.direction.toLowerCase()}`}>{s.direction}</span>
                        </div>
                        <div className="signals__confidence">Confidence: {s.confidence}%</div>
                        <div className="signals__price">Price: {formatNumber(s.price)}</div>
                        {s.direction !== 'NEUTRAL' && (
                            <>
                                <div>Stop-loss: {formatNumber(s.stopLoss)}</div>
                                <div>Target: {formatNumber(s.target)}</div>
                            </>
                        )}
                        <ul className="signals__reasons">
                            {s.reasons.map((r, idx) => <li key={idx}>{r}</li>)}
                        </ul>
                    </div>
                ))}
            </div>

            <h2>Market News &amp; Possible Impact</h2>
            {newsError && <p className="signals__error">{newsError}</p>}
            <ul className="signals__news">
                {news.map((n, idx) => (
                    <li key={idx}>
                        <span className="signals__news-tags">{n.tags.join(', ')}</span>{' '}
                        <a href={n.url} target="_blank" rel="noopener noreferrer">{n.title}</a>
                        {n.source && <span className="signals__news-source"> — {n.source}</span>}
                    </li>
                ))}
            </ul>
            <p className="signals__note">
                This lists already-published headlines with a rough keyword-based bias/impact
                tag — it is not a forecast of news that hasn't happened yet. For scheduled macro
                events (Fed meetings, CPI releases, jobs reports) check a live economic calendar
                directly, since this page cannot verify future dates on its own.
            </p>
        </div>
    )
}

export default TradingSignals
