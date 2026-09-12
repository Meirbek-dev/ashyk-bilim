-- Custom roles carry their own display text (DECISIONS 2026-09-12, RBAC admin
-- surface); seeded roles keep the catalog keys and leave these NULL.
ALTER TABLE roles
    ADD COLUMN display_name text,
    ADD COLUMN description  text;

UPDATE roles
   SET display_name = display_name_key,
       description  = NULLIF(description_key, '')
 WHERE NOT is_system;
