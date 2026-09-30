-- BUG-206: a save that leaves the attempt pending (feedback / partial item
-- scores, no score of record) writes a ledger entry with no final score.
ALTER TABLE grading_entries ALTER COLUMN final_score DROP NOT NULL;
