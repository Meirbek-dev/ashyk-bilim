-- OPEN-G-4: the landing lead and «О платформе» in the visitor's language. `description` / `about`
-- stay the Russian (base) text; these hold the Kazakh and English versions. Blank = not
-- translated: the web falls back to the Russian text.
ALTER TABLE platforms
    ADD COLUMN description_kk text NOT NULL DEFAULT '',
    ADD COLUMN description_en text NOT NULL DEFAULT '',
    ADD COLUMN about_kk       text NOT NULL DEFAULT '',
    ADD COLUMN about_en       text NOT NULL DEFAULT '';
