-- QaMessage.citations is an object on the wire (legacy `citations_json`
-- defaulted to `{}`); user turns were stored as `[]` and broke the schema.
UPDATE ai_qa_messages SET citations = '{}'::jsonb WHERE jsonb_typeof(citations) <> 'object';
ALTER TABLE ai_qa_messages
    ALTER COLUMN citations SET DEFAULT '{}'::jsonb,
    ADD CONSTRAINT ai_qa_messages_citations_object CHECK (jsonb_typeof(citations) = 'object');
