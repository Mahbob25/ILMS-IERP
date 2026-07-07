export function getLocalDateString(): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
  return formatter.format(new Date());
}

export function formatDisplayDate(
  dateStr: string,
  locale: string
): string {
  try {
    return new Date(dateStr + "T00:00:00").toLocaleDateString(
      locale === "ar" ? "ar-SA" : "en-US",
      { year: "numeric", month: "short", day: "numeric" }
    );
  } catch {
    return dateStr;
  }
}

export function formatDisplayDateTime(
  isoString: string | null,
  locale: string
): string {
  if (!isoString) return "\u2014";
  try {
    const dt = new Date(isoString);
    return dt.toLocaleDateString(
      locale === "ar" ? "ar-SA" : "en-US",
      {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }
    );
  } catch {
    return isoString;
  }
}
