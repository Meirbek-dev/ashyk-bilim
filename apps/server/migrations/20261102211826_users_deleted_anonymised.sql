-- A deleted account is anonymised (REWRITE 5.6 n10): what anonymise_user writes (self-deletion and
-- `ashyq admin erase-user`) is the only way to deleted_at, so a deleted row keeps no personal field: the
-- login names are the `deleted-...` placeholder (email `<placeholder>@deleted.invalid`), name, bio and
-- organization are blank and there is no avatar. No repair: an older deleted row that kept personal data is
-- an erasure to run (RUNBOOK 2.3), not a rewrite here, so the check is then recorded as skipped.
SET LOCAL lock_timeout = '5s';

SELECT schema_try_check('users', 'users_deleted_anonymised_check',
    $$deleted_at IS NULL OR (username LIKE 'deleted-%' AND email = username || '@deleted.invalid'
        AND display_name = '' AND bio = '' AND organization = '' AND avatar_key IS NULL)$$);
