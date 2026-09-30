-- The user's organization (school, university, company), required at
-- self-registration; '' for accounts created before it existed - the web
-- dashboard asks for it until it is set.
ALTER TABLE users
    ADD COLUMN organization text NOT NULL DEFAULT '';
