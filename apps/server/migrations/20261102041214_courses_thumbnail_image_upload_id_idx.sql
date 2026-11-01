-- no-transaction
CREATE INDEX CONCURRENTLY IF NOT EXISTS courses_thumbnail_image_upload_id_idx ON courses (thumbnail_image_upload_id) WHERE thumbnail_image_upload_id IS NOT NULL;
