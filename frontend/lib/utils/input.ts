export function sanitizeInput(value: string): string {
  return value
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;")
    .replace(/\//g, "&#x2F;")
    .trim();
}

export function escapeLikeWildcards(value: string): string {
  return value.replace(/[%_]/g, "\\$&");
}

export function validateName(value: string, locale: "ar" | "en"): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (locale === "ar") {
    return /^[\u0600-\u06FF\s]+$/.test(trimmed);
  }
  return /^[a-zA-Z\s]+$/.test(trimmed);
}
