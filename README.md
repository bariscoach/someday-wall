# Someday Wall

One day, I will… — finish the sentence and it becomes a brick in a wall built by strangers.

Static front end, two serverless functions, one Postgres database. No build step, no framework, free on all three services.

```
someday-wall/
├── index.html        the whole page (markup + CSS)
├── app.js            front end logic, talks to /api
├── favicon.svg
├── api/
│   ├── _lib.js       Supabase client, moderation, rate limit
│   ├── bricks.js     GET the wall · POST a new brick
│   └── heart.js      GET your hearts · POST toggle a heart
├── schema.sql        run once in Supabase
├── package.json
└── .env.example
```

## How it works

**Bricks are unique.** A `unique index` on a normalised copy of the text means the same sentence cannot exist twice — case, spacing, apostrophe style and trailing punctuation are ignored. Submitting an existing sentence doesn't create a duplicate: the `lay_brick` SQL function increments that brick's `echoes` count and returns it, so the person joins the brick that's already there. The reveal sheet then reads "12 hearts · 4 people wrote this".

**One heart per person.** The `hearts` table has a primary key of `(brick_id, voter)`, so a second heart from the same voter is impossible at the database level rather than merely discouraged in the browser. `voter` is a random UUID kept in `localStorage` — anonymous, and clearable by a determined person, which is an acceptable trade for having no login.

**The database is not reachable from the browser.** Row level security is on with no policies, so the only key that can read or write is the service role key, and it lives exclusively in the Vercel functions' environment variables.

**Bricks shrink as the wall grows**, floored at 9px, and drop their textures below 26px so the frame rate holds. Past ~4,000 bricks in the DOM you'll want a canvas renderer; there's a console warning at that threshold.

---

## 1 · Database (Supabase)

1. [supabase.com](https://supabase.com) → **New project**. Pick a region near your users. Save the database password somewhere safe.
2. Left sidebar → **SQL Editor** → **New query**.
3. Paste the entire contents of `schema.sql` and press **Run**. It creates both tables, the uniqueness index, the two functions, turns on RLS, and inserts five starter bricks.
4. **Project Settings → API**. Copy two things:
   - **Project URL** → this is `SUPABASE_URL`
   - **service_role** secret → this is `SUPABASE_SERVICE_KEY`

> Use the `service_role` key, not `anon`. And never paste it into any file you commit.

## 2 · GitHub

From this folder:

```bash
git init
git add .
git commit -m "Someday Wall"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/someday-wall.git
git push -u origin main
```

Create the empty repo on GitHub first (no README, no .gitignore — this folder has them).

## 3 · Vercel

1. [vercel.com](https://vercel.com) → **Add New → Project** → import the repo.
2. Framework preset: **Other**. Leave build command and output directory empty — there's nothing to build.
3. Before deploying, open **Environment Variables** and add both, for all environments:

   | Name | Value |
   |---|---|
   | `SUPABASE_URL` | `https://your-ref.supabase.co` |
   | `SUPABASE_SERVICE_KEY` | your service_role key |

4. **Deploy**. Vercel installs `@supabase/supabase-js`, serves `index.html` statically, and turns `api/*.js` into functions at `/api/bricks` and `/api/heart`.

If you add the env vars after the first deploy, redeploy — functions only pick them up at build time.

## 4 · Domain

Vercel → project → **Settings → Domains** → add `somedaywall.com`, then point your registrar's nameservers or add the A/CNAME records Vercel shows you. HTTPS is automatic.

## Running it locally

```bash
npm i -g vercel
npm install
cp .env.example .env.local     # then fill in the real values
vercel dev
```

Then open http://localhost:3000.

Opening `index.html` straight off disk will render the design but show *offline preview* in the wall stats — `file://` can't reach `/api`, and Spotify's embed API is usually blocked on that protocol too.

## API

```
GET  /api/bricks?limit=800&offset=0      newest first
GET  /api/bricks?sort=top&limit=100      most hearted first
POST /api/bricks   { text, color, voter } → { brick, is_new }
GET  /api/heart?voter=…                  → { liked: [brick_id] }
POST /api/heart    { brick_id, voter }   → { hearts, liked }
```

Reads are cached at the edge for 10s (`s-maxage=10, stale-while-revalidate=60`), so a burst of traffic mostly never reaches Postgres.

## Moderation

Two layers today: a keyword and link check in the browser for instant feedback, and the same check server-side in `api/_lib.js` because the browser can be bypassed. Both are deliberately short lists — a backstop, not a policy.

When you want something stronger and still free, run these in the browser before submitting: [`@tensorflow-models/toxicity`](https://github.com/tensorflow/tfjs-models/tree/master/toxicity) for text and [NSFWJS](https://github.com/infinitered/nsfwjs) if you ever add image bricks. Both are models that download once and run locally, so there's no per-call cost at any volume. Add a report button on the reveal sheet as a human backstop — automated moderation never catches everything.

## Things worth doing next

- **Report button** on each brick, writing to a `reports` table you can review in the Supabase dashboard.
- **Canvas renderer** once a wall passes a few thousand bricks.
- **OG image** so shared links show the wall instead of nothing — a static `og.png` is enough to start.
- **Backups**: Supabase's free tier keeps limited backups. For an archive people care about, schedule your own `pg_dump`.
- **Rate limiting** that survives cold starts, via Upstash Redis or Vercel's WAF rules.

## Costs

Free on Supabase's and Vercel's current free tiers for a project at this size. The first things to watch are Supabase's database size and Vercel's function invocation count — both visible in their dashboards. The edge cache is what keeps invocations low, so leave it on.
