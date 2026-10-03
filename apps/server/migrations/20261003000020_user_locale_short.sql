-- D-03 (stage 2): `users.locale` stores the short tags `ru` / `kk` / `en`
-- from now on (writes normalize). The legacy region tags stay valid while
-- `ashyq admin migrate-locales` rewrites the existing rows; phase 9 drops
-- them from the CHECK. Responses keep answering `locale` in the legacy
-- form (plus `language` in the short one) until then.
ALTER TABLE users DROP CONSTRAINT users_locale_check;
ALTER TABLE users ADD CONSTRAINT users_locale_check
    CHECK (locale IN ('ru', 'kk', 'en', 'ru-RU', 'kk-KZ', 'en-US'));
ALTER TABLE users ALTER COLUMN locale SET DEFAULT 'ru';
