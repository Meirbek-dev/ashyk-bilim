-- Functions created or replaced by this release's schema review run with the app's path too
-- (20261102091000 explains why). Stays the last migration of the release.

SET LOCAL lock_timeout = '5s';

SELECT pin_function_search_paths();
