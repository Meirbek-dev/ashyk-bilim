-- Course discussions (P6.2) on the P2 tables `course_discussions` +
-- `discussion_reactions`: the denormalized counters become trigger-maintained
-- (the legacy incremented them in application code and let them drift), and
-- the newest-first keyset listing gets its index.

CREATE FUNCTION discussion_reactions_recount() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    UPDATE course_discussions d SET
        likes_count = (SELECT count(*) FROM discussion_reactions r
                        WHERE r.discussion_id = d.id AND r.reaction = 'like'),
        dislikes_count = (SELECT count(*) FROM discussion_reactions r
                           WHERE r.discussion_id = d.id AND r.reaction = 'dislike')
    WHERE d.id IN (
        SELECT x FROM unnest(ARRAY[
            CASE WHEN TG_OP <> 'DELETE' THEN NEW.discussion_id END,
            CASE WHEN TG_OP <> 'INSERT' THEN OLD.discussion_id END
        ]) AS t(x) WHERE x IS NOT NULL
    );
    RETURN NULL;
END $$;

CREATE TRIGGER discussion_reactions_recount
    AFTER INSERT OR UPDATE OR DELETE ON discussion_reactions
    FOR EACH ROW EXECUTE FUNCTION discussion_reactions_recount();

CREATE FUNCTION course_discussions_recount_replies() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    UPDATE course_discussions d SET
        replies_count = (SELECT count(*) FROM course_discussions c
                          WHERE c.parent_id = d.id AND c.status = 'active')
    WHERE d.id IN (
        SELECT x FROM unnest(ARRAY[
            CASE WHEN TG_OP <> 'DELETE' THEN NEW.parent_id END,
            CASE WHEN TG_OP <> 'INSERT' THEN OLD.parent_id END
        ]) AS t(x) WHERE x IS NOT NULL
    );
    RETURN NULL;
END $$;

-- `UPDATE OF status, parent_id` keeps the recount from re-triggering itself.
CREATE TRIGGER course_discussions_recount_replies
    AFTER INSERT OR UPDATE OF status, parent_id OR DELETE ON course_discussions
    FOR EACH ROW EXECUTE FUNCTION course_discussions_recount_replies();

CREATE INDEX course_discussions_posts_keyset_idx
    ON course_discussions (course_id, id DESC) WHERE parent_id IS NULL AND status = 'active';
CREATE INDEX course_discussions_replies_keyset_idx
    ON course_discussions (parent_id, id) WHERE status = 'active';
