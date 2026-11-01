-- no-transaction
CREATE INDEX CONCURRENTLY IF NOT EXISTS courses_thumbnail_video_upload_id_idx ON courses (thumbnail_video_upload_id) WHERE thumbnail_video_upload_id IS NOT NULL;
