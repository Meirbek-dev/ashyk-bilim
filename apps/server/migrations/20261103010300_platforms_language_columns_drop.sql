SET LOCAL lock_timeout = '5s';
-- contract: item 32, the server reads and writes `translations` for the
-- platform's Kazakh / English texts since 20261102011200; nothing reads or
-- writes platforms.description_kk / _en / about_kk / _en any more.

-- data-fix: the sync triggers kept both sides equal; copy the columns once
-- more for safety (a non-blank column without its row).
INSERT INTO translations (entity, entity_id, field, lang, text)
SELECT 'platform', p.id, v.field, v.lang, v.text
  FROM platforms p,
       LATERAL (VALUES ('description', 'kk', p.description_kk), ('description', 'en', p.description_en),
                       ('about', 'kk', p.about_kk), ('about', 'en', p.about_en)) AS v(field, lang, text)
 WHERE v.text <> ''
ON CONFLICT DO NOTHING;

DROP TRIGGER platforms_sync_translations ON platforms;
DROP FUNCTION platforms_sync_translations();
DROP TRIGGER translations_sync_platforms ON translations;
DROP FUNCTION translations_sync_platforms();

-- A translation change still moves the platform's version (If-Match).
CREATE FUNCTION translations_touch_platform() RETURNS trigger
    LANGUAGE plpgsql AS $$
DECLARE
    r translations;
BEGIN
    IF TG_OP = 'DELETE' THEN
        r := OLD;
    ELSE
        r := NEW;
    END IF;
    IF r.entity = 'platform' THEN
        UPDATE platforms SET version = version + 1 WHERE id = r.entity_id;
    END IF;
    RETURN NULL;
END $$;
CREATE TRIGGER translations_touch_platform
    AFTER INSERT OR UPDATE OR DELETE ON translations
    FOR EACH ROW EXECUTE FUNCTION translations_touch_platform();

ALTER TABLE platforms
    DROP COLUMN description_kk, DROP COLUMN description_en,
    DROP COLUMN about_kk, DROP COLUMN about_en;
