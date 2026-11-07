-- The rows the review's unique indexes need repaired, before they are built (database review 2026-11-07).

SET LOCAL lock_timeout = '5s';

-- data-fix: of two cases at one position of a run, the newest row is the run's result.
DELETE FROM code_run_cases a USING code_run_cases b
 WHERE a.run_id = b.run_id AND a.position = b.position AND a.id < b.id;

-- data-fix: a turn's retry wrote a second message; the newest keeps the turn id, older ones stay as history.
UPDATE ai_qa_messages a SET client_turn_id = NULL
  FROM ai_qa_messages b
 WHERE a.client_turn_id IS NOT NULL AND a.client_turn_id = b.client_turn_id
   AND a.course_id = b.course_id AND a.user_id = b.user_id AND a.role = b.role AND a.id < b.id;

-- data-fix: of two feedback rows on one item of one entry, the newest is the grader's last word.
DELETE FROM item_feedback a USING item_feedback b
 WHERE a.grading_entry_id = b.grading_entry_id AND a.item_ref = b.item_ref AND a.id < b.id;
