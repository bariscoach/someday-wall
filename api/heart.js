import { sb, checkVoter, rateLimit } from './_lib.js';

export default async function handler(req, res) {
  /* which bricks has this person already hearted? */
  if (req.method === 'GET') {
    const voter = checkVoter(req.query.voter);
    if (!voter) return res.status(400).json({ error: 'Missing voter id.' });

    const { data, error } = await sb
      .from('hearts')
      .select('brick_id')
      .eq('voter', voter)
      .limit(5000);

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ liked: (data ?? []).map(r => r.brick_id) });
  }

  /* toggle one heart — the (brick_id, voter) primary key is what makes
     "one heart per person" true rather than merely polite */
  if (req.method === 'POST') {
    const body = typeof req.body === 'string' ? safeJson(req.body) : (req.body || {});
    const voter = checkVoter(body.voter);
    const brick = parseInt(body.brick_id, 10);

    if (!voter)            return res.status(400).json({ error: 'Missing voter id.' });
    if (!Number.isInteger(brick)) return res.status(400).json({ error: 'Missing brick id.' });
    if (!rateLimit('heart:' + voter, 40)) return res.status(429).json({ error: 'Slow down a moment.' });

    const { data, error } = await sb.rpc('toggle_heart', { p_brick: brick, p_voter: voter });
    if (error) return res.status(500).json({ error: error.message });

    const row = Array.isArray(data) ? data[0] : data;
    return res.status(200).json({ hearts: row.hearts, liked: row.liked });
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed.' });
}

function safeJson(s) { try { return JSON.parse(s); } catch { return {}; } }
