-- Platform branding travels the upload pipeline like block media: two new
-- purposes, and a seeded singleton row so GET /platform always answers
-- (ETL updates it in place at cutover).

ALTER TABLE uploads DROP CONSTRAINT uploads_purpose_check;
ALTER TABLE uploads ADD CONSTRAINT uploads_purpose_check CHECK (purpose IN (
    'avatar', 'course-thumbnail', 'block-image', 'block-pdf', 'block-video',
    'file-submission', 'platform-logo', 'platform-thumbnail'));

INSERT INTO platforms (name, email)
VALUES ('Ashyq Bilim', 'support@tou.edu.kz')
ON CONFLICT (singleton) DO NOTHING;
