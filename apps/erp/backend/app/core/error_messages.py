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
    "section_no_price": {
        "ar": "لا يمكن التسجيل - الشعبة ليس لها سعر محدد. يجب تعيين السعر أولاً",
        "en": "Cannot enroll - section has no price set. Set the section price first",
    },
    "student_email_taken": {
        "ar": "البريد الإلكتروني مسجل مسبقاً في البوابة - استخدم بريداً إلكترونياً آخر",
        "en": "Email is already registered in the portal - use a different email",
    },
    "student_phone_taken": {
        "ar": "رقم الهاتف مسجل مسبقاً في البوابة - استخدم رقم هاتف آخر",
        "en": "Phone is already registered in the portal - use a different phone number",
    },
    "parent_phone_taken": {
        "ar": "رقم هاتف ولي الأمر مسجل مسبقاً في البوابة - استخدم رقم هاتف آخر",
        "en": "Parent phone is already registered in the portal - use a different phone number",
    },
    "duplicate_record": {
        "ar": "هذه البيانات متعارضة مع بيانات مسجلة مسبقاً - تحقق من التكرار وحاول مرة أخرى",
        "en": "This data conflicts with a record that already exists - check for duplicates and try again",
    },
}


def get_error_detail(code: str, locale: str = "ar") -> str:
    msg = ERROR_MESSAGES.get(code)
    if not msg:
        return code
    return msg.get(locale, msg.get("en", code))
