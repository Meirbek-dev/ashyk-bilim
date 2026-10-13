-- Keep the storage session with its ledger row so cancellation and the reaper
-- can abort unfinished multipart uploads after a server restart.
ALTER TABLE uploads ADD COLUMN multipart_id text;
