export function validateDisplayName(value: string): { value: string | null; error: string | null } {
  const normalized = value.trim();
  const characterCount = Array.from(normalized).length;
  if (characterCount === 0) return { value: null, error: 'Enter a display name.' };
  if (characterCount > 80) return { value: null, error: 'Use 80 characters or fewer.' };
  if (/[\u0000-\u001F\u007F-\u009F]/u.test(normalized)) {
    return { value: null, error: 'Display names can’t contain control characters.' };
  }
  return { value: normalized, error: null };
}
