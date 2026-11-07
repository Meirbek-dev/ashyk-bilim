-- Functions this release replaced run with the app's path too (20261102091000 explains why). Stays its last migration.

SET LOCAL lock_timeout = '5s';

SELECT pin_function_search_paths();
