import arcjet, { shield, detectBot, slidingWindow } from '@arcjet/node';

export const aj = arcjet({
  key: process.env.ARCJET_KEY,
  characteristics: ['ip.src'],
  rules: [
    shield({ mode: 'LIVE' }),
    detectBot({ mode: 'LIVE', allow: ['CATEGORY:SEARCH_ENGINE'] }),
    slidingWindow({ interval: 10, max: 50 }),
  ],
});

// Tighter window for WebSocket upgrade handshakes — 5 connections per 2s per IP
export const wsAj = aj.withRule(
  slidingWindow({ interval: 2, max: 5 })
);

export async function arcjetMiddleware(req, res, next) {
  const decision = await aj.protect(req);
  if (decision.isDenied()) {
    if (decision.reason.isBot?.()) return res.status(403).json({ error: 'Bot detected' });
    return res.status(429).json({ error: 'Rate limit exceeded' });
  }
  next();
}
