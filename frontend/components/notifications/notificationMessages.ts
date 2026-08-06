"use client";

export type NotificationType =
  | "refund_requested"
  | "refund_disbursed"
  | "withdrawal_requested"
  | "unlock_requested"
  | "amendment_pending"
  | "section_ready_for_completion"
  | "section_cancelled"
  | "grade_submitted"
  | "unclosed_day"
  | "section_low_occupancy"
  | "section_overdue";

const dictionary: Record<
  string,
  { title: { ar: string; en: string }; body: { ar: string; en: string } }
> = {
  "refund_requested": {
    title: { ar: "طلب استرداد جديد", en: "New Refund Request" },
    body: { ar: "تم إنشاء طلب استرداد ({source})", en: "A refund request was created ({source})" },
  },
  "refund_disbursed": {
    title: { ar: "تم صرف استرداد", en: "Refund Disbursed" },
    body: { ar: "تم صرف مبلغ استرداد بنجاح", en: "A refund has been disbursed successfully" },
  },
  "withdrawal_requested": {
    title: { ar: "طلب سحب معلم", en: "Teacher Withdrawal Request" },
    body: { ar: "معلم يطلب سحب من المحفظة", en: "A teacher has requested a wallet withdrawal" },
  },
  "unlock_requested": {
    title: { ar: "طلب فتح يوم", en: "Day Unlock Request" },
    body: { ar: "تم طلب فتح يوم {date}", en: "Unlock requested for {date}" },
  },
  "amendment_pending": {
    title: { ar: "تعديل عقد معلق", en: "Pending Contract Amendment" },
    body: { ar: "هناك طلب تعديل عقد بانتظار الموافقة", en: "A contract amendment is pending approval" },
  },
  "section_ready_for_completion": {
    title: { ar: "شعبة جاهزة للإكمال", en: "Section Ready for Completion" },
    body: { ar: "شعبة جاهزة للإكمال والاعتماد", en: "A section is ready for completion" },
  },
  "section_cancelled": {
    title: { ar: "تم إلغاء شعبة", en: "Section Cancelled" },
    body: { ar: "تم إلغاء شعبة دراسية", en: "A course section has been cancelled" },
  },
  "grade_submitted": {
    title: { ar: "تم تسجيل درجات", en: "Grades Submitted" },
    body: { ar: "تم تسجيل درجات الشعبة بنجاح", en: "Section grades have been submitted" },
  },
  "unclosed_day": {
    title: { ar: "يوم غير مغلق", en: "Unclosed Day" },
    body: { ar: "يوم {date} لم يتم إغلاقه بعد", en: "Day {date} has not been closed yet" },
  },
  "section_low_occupancy": {
    title: { ar: "إشغال منخفض", en: "Low Occupancy" },
    body: { ar: "شعبة معلقة بإشغال منخفض", en: "A pending section has low occupancy" },
  },
  "section_overdue": {
    title: { ar: "شعبة متأخرة", en: "Overdue Section" },
    body: { ar: "شعبة نشطة تجاوزت تاريخ الانتهاء", en: "An active section is past its end date" },
  },
};

export function renderNotification(
  titleKey: string,
  bodyKey: string | null,
  params: Record<string, string> | null,
  locale: string,
): { title: string; body: string } {
  const lookup = titleKey.startsWith("notif.") ? titleKey.slice(6) : titleKey;
  const entry = dictionary[lookup];
  const l = locale === "en" ? "en" : "ar";

  let title = entry?.title[l] ?? titleKey;
  let body = (bodyKey && entry?.body?.[l]) ?? "";

  if (params) {
    for (const [k, v] of Object.entries(params)) {
      const placeholder = `{${k}}`;
      title = title.replaceAll(placeholder, v);
      body = body.replaceAll(placeholder, v);
    }
  }

  return { title, body };
}
