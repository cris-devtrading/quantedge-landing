export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // CORS headers — allow your domain only in production
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  const { messages } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Invalid request body' });
  }

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'API key not configured on server' });
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: `You are the QuantEdge AI Analyst — an institutional-grade financial intelligence assistant specialized in:
- US equity markets (NYSE, NASDAQ): options strategies, Greeks analysis, earnings plays
- European markets (DAX, CAC40, FTSE, Euro Stoxx): macro-driven positioning
- Options: Black-Scholes pricing, Delta/Gamma/Theta/Vega/Rho, IV analysis, spreads, straddles
- Algo trading: mean reversion, momentum, IBKR integration, risk management
- Macro intelligence: Fed policy, bond yields, DXY, CPI/PPI, credit spreads
- Black Swan detection: VIX term structure, liquidity conditions, tail risk signals
- Crypto futures: BTC/ETH KuCoin/Binance, funding rates

Respond concisely and professionally. Use specific numbers, percentages and market terminology. 
When asked about a ticker, provide: current context, key levels, options flow if relevant, and risk factors.
Always mention relevant risk management considerations.
Format: clear, direct, institutional tone. No fluff.`,
        messages: messages
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: data.error?.message || 'Anthropic API error' });
    }

    return res.status(200).json({
      content: data.content[0]?.text || ''
    });

  } catch (err) {
    console.error('API route error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
