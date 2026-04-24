const INVALID = /[/\\:*?"<>|]/g;

export function sanitizeFilename(input: string): string {
  const cleaned = input.replace(INVALID, '').trim();
  return cleaned.length > 0 ? cleaned : 'results';
}
