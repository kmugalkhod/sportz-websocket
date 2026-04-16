import arcjet, { shield, detectBot, slidingWindow } from '@arcjet/node';

// In development mode ArcJet rules run in DRY_RUN — they log decisions but
// never block. Set ARCJET_ENV=production to enforce in prod.
const isDev = (process.env.ARCJET_ENV ?? 'development') !== 'production';
const ruleMode = isDev ? 'DRY_RUN' : 'LIVE';

export const aj = arcjet({
  key: process.env.ARCJET_KEY,
  characteristics: ['ip.src'],
  rules: [
    shield({ mode: ruleMode }),
    detectBot({ mode: ruleMode, allow: ['CATEGORY:SEARCH_ENGINE', 'CATEGORY:MONITOR'] }),
    slidingWindow({ mode: ruleMode, interval: 10, max: 50 }),
  ],
});

// Tighter window for WebSocket upgrade handshakes
export const wsAj = aj.withRule(
  slidingWindow({ mode: ruleMode, interval: 2, max: 20 })
);

export async function arcjetMiddleware(req, res, next) {
  const decision = await aj.protect(req);
  if (decision.isDenied()) {
    if (decision.reason.isBot?.()) return res.status(403).json({ error: 'Bot detected' });
    return res.status(429).json({ error: 'Rate limit exceeded' });
  }
  next();
}
