-- contract: issue_certificate writes the frozen fields itself (schema review 48), since the release before this one.

SET LOCAL lock_timeout = '5s';

DROP TRIGGER certificate_users_issue ON certificate_users;
DROP FUNCTION certificate_users_issue();
