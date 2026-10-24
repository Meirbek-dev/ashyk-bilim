-- OPEN-G-2: 12 migrated assessments carried a title different from their activity's name (the
-- legacy kept two). Every edit since the cutover writes both, and the name in the course programme
-- (`activities.name`) is the one teachers and learners see in both webs: the assessment follows it.
UPDATE assessments a
   SET title = ac.name
  FROM activities ac
 WHERE ac.id = a.activity_id
   AND a.title <> ac.name;
