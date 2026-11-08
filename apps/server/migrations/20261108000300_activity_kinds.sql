-- Schema review 2026-11-08, item 11: the activity kinds are a lookup table with a composite foreign key, not a
-- 12-branch CHECK rewritten (DROP + ADD under ACCESS EXCLUSIVE and a full scan of activities) for every new kind.
-- A new kind is one INSERT here plus its row in `catalog::curriculum::TYPE_SUBTYPES`
-- (`activity_kinds_match_the_server_list` keeps both equal). Same pattern as notification_kinds (20261101230000).
--
-- Seeded with the pairs the CHECK allowed. Every stored row satisfied that CHECK, so the key validates; the CHECK
-- goes in this file, since dropping it only loosens what the previous release can write.

SET LOCAL lock_timeout = '5s';

CREATE TABLE core.activity_kinds (
    kind     text NOT NULL,
    sub_kind text NOT NULL,
    PRIMARY KEY (kind, sub_kind)
);
COMMENT ON TABLE core.activity_kinds IS
    'Lookup: the activity kinds (type and sub-type pairs) an activity can have; mirrors catalog::curriculum::TYPE_SUBTYPES.';

INSERT INTO core.activity_kinds (kind, sub_kind) VALUES
    ('dynamic', 'dynamic_page'),
    ('video', 'video_youtube'),
    ('video', 'video_hosted'),
    ('document', 'document_pdf'),
    ('document', 'document_doc'),
    ('quiz', 'quiz_standard'),
    ('exam', 'exam_standard'),
    ('code_challenge', 'code_general'),
    ('code_challenge', 'code_competitive'),
    ('file_submission', 'file_submission_standard'),
    ('custom', 'custom');

SELECT schema_try_fk('activities', 'activities_kind_fkey',
    'FOREIGN KEY (activity_type, activity_sub_type) REFERENCES activity_kinds (kind, sub_kind)
     ON UPDATE CASCADE');

ALTER TABLE activities DROP CONSTRAINT activities_type_subtype_valid;

SELECT apply_role_grants(current_user);
