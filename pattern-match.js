/**
 * QuantEdge — Pattern Matcher API
 * /api/pattern-match.js  →  Vercel Serverless Function (Node.js 18+)
 *
 * GET /api/pattern-match?ticker=SPY&timeframe=5D&metrics=move,vix,trend,rsi,vol
 *
 * Sin dependencias npm — usa fetch nativo de Node 18+
 */

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { ticker = 'SPY', timeframe = '5D', metrics = 'move,vix,trend,rsi,vol' } = req.query;
  const HORIZONS = { '1D': 1, '5D': 5, '20D': 20 };
  const horizon = HORIZONS[timeframe] || 5;
  const activeMetrics = metrics.split(',').map(m => m.trim());
  const sym = ticker.toUpperCase().trim();

  try {
    // ── Fetch datos históricos ──────────────────────────────
    const [ohlcv, vixData] = await Promise.all([
      fetchYahoo(sym),
      fetchYahoo('^VIX'),
    ]);

    if (!ohlcv || ohlcv.dates.length < 250) {
      return res.status(404).json({ error: `No data found for ${sym}` });
    }

    // ── Calcular métricas ───────────────────────────────────
    const features = buildFeatures(ohlcv, vixData);
    const n = features.length;
    if (n < 50) return res.status(422).json({ error: 'Insufficient history' });

    const todayIdx = n - 1;
    const currentMove = +features[todayIdx].move.toFixed(2);

    // ── Buscar días similares ───────────────────────────────
    const TOLERANCE = { move: 0.45, rsi: 7, vix: 4, vol: 0.4 };
    const today = features[todayIdx];
    const similar = [];

    for (let i = 0; i < n - horizon - 1; i++) {
      const f = features[i];
      let match = true;

      if (activeMetrics.includes('move') && Math.abs(f.move - today.move) > TOLERANCE.move) match = false;
      if (activeMetrics.includes('rsi')  && (Math.abs(f.rsi - today.rsi) > TOLERANCE.rsi || f.rsiSlope * today.rsiSlope < 0)) match = false;
      if (activeMetrics.includes('trend') && (f.aboveMa50 !== today.aboveMa50 || f.aboveMa200 !== today.aboveMa200)) match = false;
      if (activeMetrics.includes('vix')  && Math.abs(f.vix - today.vix) > TOLERANCE.vix) match = false;
      if (activeMetrics.includes('vol')  && Math.abs(f.relVol - today.relVol) > TOLERANCE.vol) match = false;

      if (match) similar.push(i);
    }

    // ── Retornos forward ────────────────────────────────────
    const closes = ohlcv.closes;
    const fwdReturns = similar.map(i => {
      const fi = ohlcv.featureOffset + i;
      const fwdI = fi + horizon;
      if (fwdI >= closes.length) return null;
      return (closes[fwdI] - closes[fi]) / closes[fi] * 100;
    }).filter(r => r !== null);

    if (fwdReturns.length === 0) {
      return res.status(200).json({
        ticker: sym, timeframe, currentMove,
        closedHigher: 50, medianReturn: 0, sampleSize: 0,
        distribution: [],
      });
    }

    const sorted = [...fwdReturns].sort((a, b) => a - b);
    const closedHigher = +(fwdReturns.filter(r => r > 0).length / fwdReturns.length * 100).toFixed(1);
    const medianReturn = +sorted[Math.floor(sorted.length / 2)].toFixed(2);

    // Distribución en 12 buckets
    const minR = sorted[0], maxR = sorted[sorted.length - 1];
    const bucketW = (maxR - minR) / 12 || 0.5;
    const buckets = Array.from({ length: 12 }, (_, i) => ({
      bucket: +(minR + i * bucketW).toFixed(2),
      count: 0,
    }));
    fwdReturns.forEach(r => {
      const idx = Math.min(11, Math.floor((r - minR) / bucketW));
      buckets[idx].count++;
    });

    return res.status(200).json({
      ticker: sym,
      timeframe,
      currentMove,
      closedHigher,
      medianReturn,
      sampleSize: fwdReturns.length,
      distribution: buckets,
    });

  } catch (err) {
    console.error('[pattern-match] error:', err.message);
    return res.status(500).json({ error: 'Internal error: ' + err.message });
  }
}

// ── Yahoo Finance fetch ─────────────────────────────────────────────────────
async function fetchYahoo(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5y&interval=1d&events=history`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
  });
  if (!res.ok) return null;
  const json = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result) return null;
  return {
    dates:  result.timestamp.map(t => new Date(t * 1000)),
    opens:  result.indicators.quote[0].open,
    highs:  result.indicators.quote[0].high,
    lows:   result.indicators.quote[0].low,
    closes: result.indicators.quote[0].close,
    volumes: result.indicators.quote[0].volume,
    featureOffset: 0, // set later
  };
}

// ── Compute features ────────────────────────────────────────────────────────
function buildFeatures(ohlcv, vixData) {
  const { closes, volumes, dates } = ohlcv;
  const n = closes.length;

  // RSI 14
  const rsi = computeRSI(closes, 14);

  // MA 50 / 200
  const ma50  = computeMA(closes, 50);
  const ma200 = computeMA(closes, 200);

  // VIX aligned
  const vixMap = {};
  if (vixData) {
    vixData.dates.forEach((d, i) => {
      vixMap[d.toISOString().slice(0, 10)] = vixData.closes[i];
    });
  }

  // Avg volume 20
  const avgVol20 = computeMA(volumes, 20);

  const features = [];
  const WARMUP = 200; // need 200 bars for MA200

  for (let i = WARMUP; i < n; i++) {
    const move = closes[i - 1] > 0 ? (closes[i] - closes[i - 1]) / closes[i - 1] * 100 : 0;
    const rsiVal = rsi[i] ?? 50;
    const rsiSlope = (rsi[i] ?? 50) - (rsi[i - 5] ?? 50);
    const aboveMa50  = closes[i] > (ma50[i]  ?? 0) ? 1 : 0;
    const aboveMa200 = closes[i] > (ma200[i] ?? 0) ? 1 : 0;
    const dateKey = dates[i].toISOString().slice(0, 10);
    const vix = vixMap[dateKey] ?? 20;
    const relVol = avgVol20[i] > 0 ? volumes[i] / avgVol20[i] : 1;

    features.push({ move, rsi: rsiVal, rsiSlope, aboveMa50, aboveMa200, vix, relVol });
  }

  // store offset so we can map feature index back to closes index
  ohlcv.featureOffset = WARMUP;
  return features;
}

function computeRSI(closes, period) {
  const rsi = new Array(closes.length).fill(null);
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) avgGain += d / period;
    else avgLoss += Math.abs(d) / period;
  }
  rsi[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(d, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-d, 0)) / period;
    rsi[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return rsi;
}

function computeMA(arr, period) {
  const ma = new Array(arr.length).fill(null);
  let sum = 0;
  for (let i = 0; i < arr.length; i++) {
    sum += arr[i] ?? 0;
    if (i >= period) sum -= arr[i - period] ?? 0;
    if (i >= period - 1) ma[i] = sum / period;
  }
  return ma;
}
