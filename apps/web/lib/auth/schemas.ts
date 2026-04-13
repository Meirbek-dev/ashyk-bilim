import * as v from 'valibot';

/**
 * Reusable password schema factory.
 * Accepts a translator so error messages are localised at call-site.
 *
 * Rules:
 *   - min 8 characters
 *   - max 128 characters
 *   - at least one lowercase letter
 *   - at least one uppercase letter
 *   - at least one digit
 */
export const passwordSchema = (t: (key: string) => string) =>
  v.pipe(
    v.string(),
    v.minLength(8, t('passwordTooShort')),
    v.maxLength(128, t('passwordTooLong')),
    v.regex(/[a-z]/, t('passwordNeedsLowercase')),
    v.regex(/[A-Z]/, t('passwordNeedsUppercase')),
    v.regex(/[0-9]/, t('passwordNeedsNumber')),
  );
