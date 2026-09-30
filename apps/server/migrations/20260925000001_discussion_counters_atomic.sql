-- BUG-298: the discussion counters move by atomic ±1 deltas. The recount
-- (`SET likes_count = (SELECT count(*) …)`, 20260905000014) raced under
-- READ COMMITTED: a transaction waiting on the parent row's lock re-ran
-- the UPDATE on the new row version with its old snapshot and overwrote the
-- count without the other transaction's row. `x = x + 1` re-reads the
-- locked row, so concurrent likes and replies all land.

CREATE OR REPLACE FUNCTION discussion_reactions_recount() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP <> 'INSERT' THEN
        UPDATE course_discussions SET
            likes_count = likes_count - (OLD.reaction = 'like')::int,
            dislikes_count = dislikes_count - (OLD.reaction = 'dislike')::int
        WHERE id = OLD.discussion_id;
    END IF;
    IF TG_OP <> 'DELETE' THEN
        UPDATE course_discussions SET
            likes_count = likes_count + (NEW.reaction = 'like')::int,
            dislikes_count = dislikes_count + (NEW.reaction = 'dislike')::int
        WHERE id = NEW.discussion_id;
    END IF;
    RETURN NULL;
END $$;

-- Only `active` children count as replies.
CREATE OR REPLACE FUNCTION course_discussions_recount_replies() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP <> 'INSERT' AND OLD.parent_id IS NOT NULL AND OLD.status = 'active' THEN
        UPDATE course_discussions SET replies_count = replies_count - 1
        WHERE id = OLD.parent_id;
    END IF;
    IF TG_OP <> 'DELETE' AND NEW.parent_id IS NOT NULL AND NEW.status = 'active' THEN
        UPDATE course_discussions SET replies_count = replies_count + 1
        WHERE id = NEW.parent_id;
    END IF;
    RETURN NULL;
END $$;

-- One recount of every row the race left wrong.
UPDATE course_discussions d SET
    likes_count = c.likes, dislikes_count = c.dislikes, replies_count = c.replies
FROM (
    SELECT p.id,
           (SELECT count(*) FROM discussion_reactions r
             WHERE r.discussion_id = p.id AND r.reaction = 'like')::int AS likes,
           (SELECT count(*) FROM discussion_reactions r
             WHERE r.discussion_id = p.id AND r.reaction = 'dislike')::int AS dislikes,
           (SELECT count(*) FROM course_discussions k
             WHERE k.parent_id = p.id AND k.status = 'active')::int AS replies
    FROM course_discussions p
) c
WHERE c.id = d.id
  AND (d.likes_count, d.dislikes_count, d.replies_count)
      IS DISTINCT FROM (c.likes, c.dislikes, c.replies);
