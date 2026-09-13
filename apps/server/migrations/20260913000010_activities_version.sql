-- Optimistic lock for the editor autosave (UX-027): the content PATCH sends
-- `If-Match: "<version>"`; a stale version is 412 instead of a silent overwrite.
ALTER TABLE activities ADD COLUMN version integer NOT NULL DEFAULT 1;
