-- Collections get a cover image (stage 2, S-01): the storage key of a
-- claimed `collection-cover` upload, released like course thumbnails.

ALTER TABLE collections ADD COLUMN cover_key text;

ALTER TABLE uploads DROP CONSTRAINT uploads_purpose_check;
ALTER TABLE uploads ADD CONSTRAINT uploads_purpose_check CHECK (purpose IN (
    'avatar', 'course-thumbnail', 'block-image', 'block-pdf', 'block-video',
    'file-submission', 'platform-logo', 'platform-thumbnail', 'collection-cover'));
