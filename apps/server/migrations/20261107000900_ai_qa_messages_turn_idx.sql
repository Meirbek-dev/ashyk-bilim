-- no-transaction
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS ai_qa_messages_turn_role_key ON ai_qa_messages (course_id, user_id, client_turn_id, role) WHERE client_turn_id IS NOT NULL;
