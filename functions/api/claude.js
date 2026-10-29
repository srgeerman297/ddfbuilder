// Cloudflare Pages Function: POST /api/claude
// Keeps the Anthropic API key on the server. The page sends a prompt (and page images for
// scanned PDFs); this calls Claude and returns the JSON Claude produced.
//
// Settings (Cloudflare Pages > Settings > Variables and Secrets):
//   ANTHROPIC_API_KEY  secret, required. Without it the builder uses the step-by-step chat.
//   ACCESS_CODE        secret, optional. When set, the page asks for this code once per browser.
//   MODEL_QUICK        optional, model for chat turns (default claude-haiku-5-5).
//   MODEL_DEFAULT      optional, model for PDF reading (default claude-sonnet-5-5).

const LIMITS = { images: { maxCount: 5, maxBytes: 4_000_000 }, promptChars: 200_000 };
const SYSTEM = 'You are the assistant inside AXIOMA\'s Shufti DDF Builder. Follow the instructions in the user message. Reply with one JSON value only: no prose, no code fences.';

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
});

function denied(request, env) {
  // Same-site calls only: a browser on another site can't spend the key.
  const origin = request.headers.get('origin');
  if (origin && new URL(origin).host !== new URL(request.url).host) return json({ error: 'Cross-site requests are not allowed.' }, 403);
  if (env.ACCESS_CODE && request.headers.get('x-access-code') !== env.ACCESS_CODE) return json({ error: 'Access code required.' }, 401);
  return null;
}

// Claude sometimes wraps JSON in fences or adds a line around it; take the JSON value out.
function extractJSON(text) {
  const t = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try { return JSON.parse(t); } catch (e) {}
  const start = t.search(/[[{]/); const end = Math.max(t.lastIndexOf('}'), t.lastIndexOf(']'));
  if (start >= 0 && end > start) { try { return JSON.parse(t.slice(start, end + 1)); } catch (e) {} }
  return undefined;
}

export async function onRequestGet({ request, env }) {
  const d = denied(request, env); if (d) return d;
  return json({ enabled: Boolean(env.ANTHROPIC_API_KEY), limits: LIMITS });
}

export async function onRequestPost({ request, env }) {
  const d = denied(request, env); if (d) return d;
  if (!env.ANTHROPIC_API_KEY) return json({ error: 'Claude is not configured on this site.' }, 503);

  let body;
  try { body = await request.json(); } catch (e) { return json({ error: 'Bad request.' }, 400); }
  const prompt = typeof body.prompt === 'string' ? body.prompt : '';
  if (!prompt || prompt.length > LIMITS.promptChars) return json({ error: 'Prompt missing or too long.' }, 400);
  const images = Array.isArray(body.images) ? body.images : [];
  if (images.length > LIMITS.images.maxCount) return json({ error: 'Too many images.' }, 400);
  for (const im of images) {
    if (!im || !/^image\/(jpeg|png|webp|gif)$/.test(im.media_type) || typeof im.data !== 'string' || im.data.length * 0.75 > LIMITS.images.maxBytes) return json({ error: 'Bad image.' }, 400);
  }

  const quick = body.tier === 'quick';
  const model = quick ? (env.MODEL_QUICK || 'claude-haiku-5-5') : (env.MODEL_DEFAULT || 'claude-sonnet-5-5');
  const content = [
    ...images.map((im) => ({ type: 'image', source: { type: 'base64', media_type: im.media_type, data: im.data } })),
    { type: 'text', text: prompt },
  ];

  let r;
  try {
    r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model, max_tokens: quick ? 4096 : 16000, system: SYSTEM, messages: [{ role: 'user', content }] }),
    });
  } catch (e) { return json({ error: 'Could not reach Claude.' }, 502); }

  if (r.status === 429 || r.status === 529) return json({ error: 'Claude is busy.' }, 429);
  if (!r.ok) return json({ error: `Claude returned ${r.status}.` }, 502);
  const msg = await r.json();
  const text = (msg.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('');
  const result = extractJSON(text);
  if (result === undefined) return json({ error: 'Claude did not return JSON.' }, 502);
  return json({ result });
}
