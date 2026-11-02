-- Learner search and AI context check visibility when they run (REWRITE 5.7): the activity is
-- published and the course not archived. The server no longer writes `content_chunks.published`, a
-- copy that lagged a publish by up to a sweep and never saw an archive. The previous release still
-- reads it, so until the column is dropped this trigger fills it the way that release wrote it.

SET LOCAL lock_timeout = '5s';

CREATE FUNCTION content_chunks_published() RETURNS trigger AS $$
BEGIN
    NEW.published := COALESCE(NEW.published, NEW.activity_id IS NULL OR COALESCE(
        (SELECT a.published FROM activities a WHERE a.id = NEW.activity_id), false));
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER content_chunks_published BEFORE INSERT ON content_chunks
    FOR EACH ROW EXECUTE FUNCTION content_chunks_published();
