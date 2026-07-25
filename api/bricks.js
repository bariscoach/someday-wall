import { sb, checkText, checkColor, checkVoter, rateLimit } from './_lib.js';

export default async function handler(req, res) {
  /* ---------------- read the wall ---------------- */
  if (req.method === 'GET') {
    const limit  = Math.min(2000, Math.max(1, parseInt(req.query.limit, 10)  || 800));
    const offset = Math.max(0,          parseInt(req.query.offset, 10) || 0);
    const top    = req.query.sort === 'top';

    const { data, error } = await sb
      .from('bricks')
      .select('id,text,color,hearts,echoes')
      .order(top ? 'hearts' : 'created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) return res.status(500).json({ error: error.message });

    res.setHeader('Cache-Control', 'public, s-maxage=10, stale-while-revalidate=60');
    return res.status(200).json({ bricks: data ?? [] });
  }

  /* ---------------- lay a brick ---------------- */
  if (req.method === 'POST') {
    const body = typeof req.body === 'string' ? safeJson(req.body) : (req.body || {});
    const voter = checkVoter(body.voter);
    if (!voter) return res.status(400).json({ error: 'Missing voter id.' });

    if (!rateLimit('lay:' + voter)) {
      return res.status(429).json({ error: 'Slow down a moment.' });
    }

    const check = checkText(body.text);
    if (!check.ok) return res.status(422).json({ error: check.why });

    const { data, error } = await sb.rpc('lay_brick', {
      p_text:  check.text,
      p_color: checkColor(body.color)
    });

    if (error) return res.status(500).json({ error: error.message });

    const row = Array.isArray(data) ? data[0] : data;
    return res.status(200).json({
      brick:  { id: row.id, text: row.text, color: row.color, hearts: row.hearts, echoes: row.echoes },
      is_new: row.is_new
    });
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed.' });
}

function safeJson(s) { try { return JSON.parse(s); } catch { return {}; } }
