-- contract: since 20261116075624 a course's and a collection's creator is its `creator` staff row (readers take
-- course_creator() / collection_creator()), and since the 5.8 contract release (55b53d33) no release writes
-- `creator_id`; the insert triggers that turned a `creator_id` into that row go with it (REWRITE 5.8 item 4).
SET LOCAL lock_timeout = '5s';

DROP TRIGGER courses_creator_row ON core.courses;
DROP TRIGGER collections_creator_row ON core.collections;
DROP FUNCTION public.courses_creator_row();
DROP FUNCTION public.collections_creator_row();

ALTER TABLE core.courses DROP COLUMN creator_id;
ALTER TABLE core.collections DROP COLUMN creator_id;
