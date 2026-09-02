/**
 * Security and input validation helper functions
 */

/**
 * Validates Taiwanese phone number format (both Mobile and Landline with optional extension or +886 country code).
 * Criteria:
 * 1. Must start with '0', '886', or '+886' (optional country prefix).
 * 2. Can only contain digits, spaces, dashes (-), parentheses (), '+', and optional extensions prefixed with '#' or 'ext'.
 * 3. The total digit count must be between 9 and 16 digits (covers local landlines 9-10 digits, mobiles 10 digits, and landlines with extensions).
 * 
 * This prevents garbage input (e.g. "+-+-+-") while remaining flexible for school staff with landline extensions.
 */
export function validatePhoneFormat(phone: string): boolean {
  const trimmed = phone.trim();
  if (!trimmed) return false;

  // 1. Check if prefix is valid
  const startsWithValidPrefix = /^(\+?886|0)/.test(trimmed);
  if (!startsWithValidPrefix) return false;

  // 2. Check allowed characters
  const hasOnlyAllowedChars = /^[0-9\s\-\(\)\+#ext\+]+$/i.test(trimmed);
  if (!hasOnlyAllowedChars) return false;

  // 3. Check digit count (must contain a reasonable density of actual numbers)
  const digitCount = (trimmed.match(/\d/g) || []).length;
  const isDigitCountValid = digitCount >= 9 && digitCount <= 16;
  if (!isDigitCountValid) return false;

  return true;
}

/**
 * Sanitizes input to protect against XSS injection, database-cluttering tags, and malicious HTML/Script content.
 * It trims the string and strips out any HTML/Script tag sequences completely.
 */
export function sanitizeInput(val: string): string {
  if (!val) return '';
  // Strip HTML-like tags: <...> and any potential script characters
  const clean = val.replace(/<[^>]*>/g, '').trim();
  return clean;
}
