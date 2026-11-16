-- no-transaction
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS collection_staff_one_creator_idx ON collection_staff (collection_id) WHERE authorship = 'creator';
