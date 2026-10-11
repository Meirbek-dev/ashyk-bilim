-- Turning a course certificate off must not take back what was issued: a certification that issued
-- certificates is retired (no new ones; the issued ones stay valid, listed and verifiable) instead of
-- deleted with them. Creating a certificate for the course again revives the retired row.
ALTER TABLE certifications ADD COLUMN disabled_at timestamptz;
