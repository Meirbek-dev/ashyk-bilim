-- UX-279: optimistic lock for collections. Bumped on every
-- `PATCH /collections/{id}`; a stale `If-Match` answers 412 instead of the
-- last writer silently replacing an edit made from another tab.
ALTER TABLE collections
    ADD COLUMN version integer NOT NULL DEFAULT 1;
