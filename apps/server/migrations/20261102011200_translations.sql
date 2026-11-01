SET LOCAL lock_timeout = '5s';

-- Schema review 3, item 32 (REWRITE 5.6 n9): user-visible text in other
-- languages lives in `translations`, one row per (entity, entity_id, field,
-- lang), instead of a column per language (`platforms.description_kk`,
-- `_en`, `about_kk`, `_en`). The base column (`platforms.description`)
-- stays the default-language text; no row = not translated (the API still
-- answers "" for it). Which fields are translatable is a lookup table, so a
-- new one is one INSERT. `entity_id` names a row of the entity's table
-- (no foreign key: one column for several tables); the platform row is a
-- singleton that is never deleted.
--
-- Expand step. The server reads and writes translations; the previous
-- binary reads and writes the platform's language columns. Two triggers
-- keep them equal until the contract file drops the columns (pg_trigger_depth()
-- keeps a copy from echoing back). A translation change updates the
-- platform row, so its version (If-Match) moves as before.

CREATE TABLE translatable_fields (
    entity text NOT NULL,
    field  text NOT NULL,
    PRIMARY KEY (entity, field)
);
INSERT INTO translatable_fields (entity, field) VALUES ('platform', 'description'), ('platform', 'about');

CREATE TABLE translations (
    entity     text NOT NULL,
    entity_id  uuid NOT NULL,
    field      text NOT NULL,
    lang       text NOT NULL CHECK (lang IN ('ru', 'kk', 'en')),
    text       text NOT NULL CHECK (text <> ''),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (entity, entity_id, field, lang),
    FOREIGN KEY (entity, field) REFERENCES translatable_fields (entity, field)
);
CREATE TRIGGER translations_set_updated_at BEFORE UPDATE ON translations
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE translations IS
    'Text of a translatable field in another language (translatable_fields); no row = not translated.';

INSERT INTO translations (entity, entity_id, field, lang, text)
SELECT 'platform', p.id, v.field, v.lang, v.text
  FROM platforms p,
       LATERAL (VALUES ('description', 'kk', p.description_kk), ('description', 'en', p.description_en),
                       ('about', 'kk', p.about_kk), ('about', 'en', p.about_en)) AS v(field, lang, text)
 WHERE v.text <> '';

-- Previous binary → rows.
CREATE FUNCTION platforms_sync_translations() RETURNS trigger
    LANGUAGE plpgsql AS $$
BEGIN
    IF pg_trigger_depth() > 1 THEN
        RETURN NULL;
    END IF;
    DELETE FROM translations t
     USING (VALUES ('description', 'kk', NEW.description_kk), ('description', 'en', NEW.description_en),
                   ('about', 'kk', NEW.about_kk), ('about', 'en', NEW.about_en)) AS v(field, lang, text)
     WHERE t.entity = 'platform' AND t.entity_id = NEW.id AND t.field = v.field AND t.lang = v.lang
       AND v.text = '';
    INSERT INTO translations AS t (entity, entity_id, field, lang, text)
    SELECT 'platform', NEW.id, v.field, v.lang, v.text
      FROM (VALUES ('description', 'kk', NEW.description_kk), ('description', 'en', NEW.description_en),
                   ('about', 'kk', NEW.about_kk), ('about', 'en', NEW.about_en)) AS v(field, lang, text)
     WHERE v.text <> ''
    ON CONFLICT (entity, entity_id, field, lang) DO UPDATE SET text = EXCLUDED.text
    WHERE t.text IS DISTINCT FROM EXCLUDED.text;
    RETURN NULL;
END $$;

CREATE TRIGGER platforms_sync_translations
    AFTER INSERT OR UPDATE OF description_kk, description_en, about_kk, about_en ON platforms
    FOR EACH ROW EXECUTE FUNCTION platforms_sync_translations();

-- Rows → the columns the previous binary reads (and the platform's version).
CREATE FUNCTION translations_sync_platforms() RETURNS trigger
    LANGUAGE plpgsql AS $$
DECLARE
    r translations;
    v text;
BEGIN
    IF TG_OP = 'DELETE' THEN
        r := OLD;
        v := '';
    ELSE
        r := NEW;
        v := NEW.text;
    END IF;
    IF pg_trigger_depth() > 1 OR r.entity <> 'platform' OR r.lang NOT IN ('kk', 'en') THEN
        RETURN NULL;
    END IF;
    UPDATE platforms SET
        description_kk = CASE WHEN r.field = 'description' AND r.lang = 'kk' THEN v ELSE description_kk END,
        description_en = CASE WHEN r.field = 'description' AND r.lang = 'en' THEN v ELSE description_en END,
        about_kk = CASE WHEN r.field = 'about' AND r.lang = 'kk' THEN v ELSE about_kk END,
        about_en = CASE WHEN r.field = 'about' AND r.lang = 'en' THEN v ELSE about_en END
    WHERE id = r.entity_id;
    RETURN NULL;
END $$;

CREATE TRIGGER translations_sync_platforms
    AFTER INSERT OR UPDATE OR DELETE ON translations
    FOR EACH ROW EXECUTE FUNCTION translations_sync_platforms();
