-- #559 (ADR 0009): every path that writes or reads private rows now names
-- its user (requests, the daily close, wallet syncs, seeds, the demo, the
-- history import), so app_user_id() stops falling back to the only user.
-- Without `app.user_id`, it is null: a write is refused by `NOT NULL` and a
-- read sees no private row.
CREATE OR REPLACE FUNCTION app_user_id() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$
    SELECT nullif(current_setting('app.user_id', true), '')::uuid
  $$;
