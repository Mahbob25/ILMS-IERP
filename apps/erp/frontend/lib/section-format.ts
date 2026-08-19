function formatTimeString(raw: string | null | undefined, locale: string): string | null {
  if (!raw) return null;
  const d = new Date(`1970-01-01T${raw}`);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleTimeString(locale === "ar" ? "ar-SA" : "en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatSectionLabel(
  section: {
    id: string;
    course_id: string;
    class_time?: string | null;
    class_duration_minutes?: number | null;
    classroom?: string | null;
  },
  getCourseName: (courseId: string) => string | undefined,
  locale: string,
): string {
  const base = getCourseName(section.course_id) ?? section.id;

  const parts: string[] = [];
  const time = formatTimeString(section.class_time ?? null, locale);
  if (time) {
    const dur = section.class_duration_minutes ? ` (${section.class_duration_minutes}min)` : "";
    parts.push(`${time}${dur}`);
  }
  if (section.classroom) {
    parts.push(`Room ${section.classroom}`);
  }

  return parts.length > 0 ? `${base} — ${parts.join(" · ")}` : base;
}
