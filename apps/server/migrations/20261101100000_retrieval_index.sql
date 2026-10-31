-- docs/AI-FIRST.md 1: semantic search over course material. A source (lesson, activity, assignment,
-- assessment item, course card) is cut into chunks with a precise anchor; each chunk keeps a lexical
-- vector (folded like search_fold, so Kazakh typed on a Russian keyboard still matches) and, once the
-- embedder ran, a 1024-dimension embedding of the model named beside it. The worker's sweep compares
-- `content_index_state.source_version` with the source's own version and re-cuts what changed.
CREATE TABLE content_chunks (
    id               uuid PRIMARY KEY DEFAULT uuidv7(),
    course_id        uuid NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
    activity_id      uuid REFERENCES activities (id) ON DELETE CASCADE,
    source_type      text NOT NULL
                     CHECK (source_type IN ('lesson', 'activity', 'assignment', 'item', 'course',
                                            'document', 'transcript')),
    source_id        uuid NOT NULL,
    ordinal          integer NOT NULL CHECK (ordinal >= 0),
    -- 'staff' chunks (assessment items) never reach a learner's search or AI context.
    audience         text NOT NULL CHECK (audience IN ('learner', 'staff')),
    published        boolean NOT NULL,
    label            text NOT NULL CHECK (char_length(label) BETWEEN 1 AND 500),
    body             text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
    anchor           jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(anchor) = 'object'),
    token_estimate   integer NOT NULL CHECK (token_estimate >= 0),
    embedding        vector(1024),
    embedding_model  text,
    lexeme           tsvector GENERATED ALWAYS AS
                     (to_tsvector('simple', search_fold(label || ' ' || body))) STORED,
    created_at       timestamptz NOT NULL DEFAULT now(),
    CHECK ((embedding IS NULL) = (embedding_model IS NULL)),
    UNIQUE (source_type, source_id, ordinal)
);
CREATE INDEX content_chunks_course_idx ON content_chunks (course_id, audience, published);
CREATE INDEX content_chunks_activity_idx ON content_chunks (activity_id);
CREATE INDEX content_chunks_lexeme_idx ON content_chunks USING gin (lexeme);
CREATE INDEX content_chunks_embedding_idx ON content_chunks USING hnsw (embedding vector_cosine_ops);

-- One row per indexed source: the version it was cut at and how it went.
CREATE TABLE content_index_state (
    source_type      text NOT NULL
                     CHECK (source_type IN ('lesson', 'activity', 'assignment', 'item', 'course',
                                            'document', 'transcript')),
    source_id        uuid NOT NULL,
    course_id        uuid NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
    activity_id      uuid REFERENCES activities (id) ON DELETE CASCADE,
    source_version   bigint NOT NULL,
    chunk_count      integer NOT NULL DEFAULT 0 CHECK (chunk_count >= 0),
    embedding_model  text,
    indexed_at       timestamptz NOT NULL DEFAULT now(),
    error            text,
    PRIMARY KEY (source_type, source_id)
);
CREATE INDEX content_index_state_course_idx ON content_index_state (course_id);
CREATE INDEX content_index_state_activity_idx ON content_index_state (activity_id);
