-- ============================================================
-- Someday Wall — Supabase schema
-- Run this once in Supabase → SQL Editor → New query → Run.
-- ============================================================

-- ---------- normalisation ----------
-- Two sentences that differ only in case, spacing, apostrophe style or
-- trailing punctuation are the SAME brick.
create or replace function norm(t text)
returns text
language sql
immutable
as $$
  select btrim(
    regexp_replace(
      regexp_replace(lower(translate(t, '’‘`', '''''''')), '\s+', ' ', 'g'),
      '[.…!?,;:]+$', '', 'g'
    )
  );
$$;

-- ---------- tables ----------
create table if not exists bricks (
  id          bigint generated always as identity primary key,
  text        text        not null check (char_length(btrim(text)) between 2 and 140),
  norm        text        not null,
  color       text        not null default '#C0552F',
  hearts      integer     not null default 0 check (hearts >= 0),
  echoes      integer     not null default 0 check (echoes >= 0),
  created_at  timestamptz not null default now()
);

-- the dedupe guarantee lives here, not in the browser
create unique index if not exists bricks_norm_key    on bricks (norm);
create index        if not exists bricks_created_idx on bricks (created_at desc);
create index        if not exists bricks_hearts_idx  on bricks (hearts desc);

-- one heart per person per brick, enforced by the primary key
create table if not exists hearts (
  brick_id   bigint      not null references bricks(id) on delete cascade,
  voter      text        not null,
  created_at timestamptz not null default now(),
  primary key (brick_id, voter)
);
create index if not exists hearts_voter_idx on hearts (voter);

-- ---------- lay a brick (insert, or join the existing one) ----------
create or replace function lay_brick(p_text text, p_color text)
returns table (id bigint, text text, color text, hearts integer, echoes integer, is_new boolean)
language plpgsql
security definer
as $$
declare
  v_id  bigint;
  v_new boolean;
begin
  insert into bricks (text, norm, color)
  values (btrim(p_text), norm(p_text), coalesce(nullif(p_color, ''), '#C0552F'))
  on conflict (norm) do update
    set echoes = bricks.echoes + 1
  returning bricks.id, (xmax = 0) into v_id, v_new;

  return query
    select b.id, b.text, b.color, b.hearts, b.echoes, v_new
    from bricks b
    where b.id = v_id;
end;
$$;

-- ---------- toggle a heart ----------
create or replace function toggle_heart(p_brick bigint, p_voter text)
returns table (hearts integer, liked boolean)
language plpgsql
security definer
as $$
declare
  v_liked boolean;
begin
  if exists (select 1 from hearts h where h.brick_id = p_brick and h.voter = p_voter) then
    delete from hearts h where h.brick_id = p_brick and h.voter = p_voter;
    update bricks b set hearts = greatest(0, b.hearts - 1) where b.id = p_brick;
    v_liked := false;
  else
    insert into hearts (brick_id, voter) values (p_brick, p_voter);
    update bricks b set hearts = b.hearts + 1 where b.id = p_brick;
    v_liked := true;
  end if;

  return query select b.hearts, v_liked from bricks b where b.id = p_brick;
end;
$$;

-- ---------- lock the tables down ----------
-- RLS on with no policies = nothing reaches these tables except the
-- service role key, which only ever lives in the Vercel functions.
alter table bricks enable row level security;
alter table hearts enable row level security;

-- ---------- optional: a few starter bricks ----------
insert into bricks (text, norm, color, hearts) values
  ('learn my grandmother''s language', norm('learn my grandmother''s language'), '#C0552F', 3),
  ('take my mother to Japan',          norm('take my mother to Japan'),          '#C9862B', 5),
  ('stop waiting for the right moment',norm('stop waiting for the right moment'),'#16906F', 8),
  ('write the book I keep describing', norm('write the book I keep describing'), '#7C6BF5', 2),
  ('swim in the sea at sunrise',       norm('swim in the sea at sunrise'),       '#3D6FA8', 4)
on conflict (norm) do nothing;
