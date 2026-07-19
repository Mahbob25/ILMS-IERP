ERROR_MESSAGES = {
    "date_is_closed": {
        "ar": "التاريخ مقفل - لا يمكن إجراء عمليات على هذا التاريخ",
        "en": "Date is closed - cannot perform operations on this date",
    },
    "date_already_closed": {
        "ar": "التاريخ مقفل بالفعل",
        "en": "Date already closed",
    },
    "date_not_closed_or_already_unlocked": {
        "ar": "التاريخ غير مقفل أو طلب الفتح مقدم بالفعل",
        "en": "Date is not closed or already unlocked",
    },
    "no_unlock_request_pending": {
        "ar": "لا يوجد طلب فتح معلق لهذا التاريخ",
        "en": "No unlock request pending for this date",
    },
    "enrollment_not_found": {
        "ar": "لم يتم العثور على التسجيل",
        "en": "Enrollment not found",
    },
    "payment_exceeds_balance": {
        "ar": "المبلغ يتجاوز الرصيد المتبقي",
        "en": "Payment amount exceeds remaining balance",
    },
    "section_cancelled": {
        "ar": "لا يمكن الدفع لشعبة ملغية",
        "en": "Cannot pay for a cancelled section",
    },
}


def get_error_detail(code: str, locale: str = "ar") -> str:
    msg = ERROR_MESSAGES.get(code)
    if not msg:
        return code
    return msg.get(locale, msg.get("en", code))
