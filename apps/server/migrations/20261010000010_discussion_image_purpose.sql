-- BUG-B-9: the `discussion-image` upload purpose (web-2 discussion posts,
-- a313938) was added to the purpose policy but never to this check, so every
-- `POST /uploads {purpose: discussion-image}` failed with a 500.

ALTER TABLE uploads DROP CONSTRAINT uploads_purpose_check;
ALTER TABLE uploads ADD CONSTRAINT uploads_purpose_check CHECK (purpose IN (
    'avatar', 'course-thumbnail', 'block-image', 'block-pdf', 'block-video',
    'file-submission', 'platform-logo', 'platform-thumbnail', 'collection-cover',
    'discussion-image'));
