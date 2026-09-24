-- BUG-263: a media block of a `dynamic` (editor) activity holds its upload
-- reference only while the saved activity content shows it. The content
-- PATCH flips `claimed` for blocks that left or re-entered the content and
-- moves the upload count with it, so removing a block releases nothing
-- until the removal is saved, and an undo saved later re-claims the upload.
-- Every existing block row holds its reference today (POST /blocks claims).
ALTER TABLE blocks ADD COLUMN claimed boolean NOT NULL DEFAULT true;
