-- Schema review item 20 (locale part): every writer stores the short tag
-- (D-03; registration, Google sign-up and profile edits all go through
-- Language::code), yet the CHECK still admitted the legacy region tags.
-- Remaining region tags are shortened with the `admin migrate-locales` rule
-- (ru-RU → ru, kk-KZ → kk, en-US → en), then the CHECK takes only short tags.

SET LOCAL ab.bookkeeping = 'on';

UPDATE users SET locale = CASE locale WHEN 'ru-RU' THEN 'ru' WHEN 'kk-KZ' THEN 'kk' ELSE 'en' END
 WHERE locale IN ('ru-RU', 'kk-KZ', 'en-US');

ALTER TABLE users DROP CONSTRAINT users_locale_check;
SELECT schema_try_check('users', 'users_locale_check', $$locale IN ('ru', 'kk', 'en')$$);
