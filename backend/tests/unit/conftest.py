import pytest


@pytest.fixture(scope="session", autouse=True)
def _register_all_models():
    from app.modules.identity.models import User  # noqa: F401
    from app.modules.academic.models import (   # noqa: F401
        Course, CourseSection, Enrollment, FinalGrade,
        Student, PendingRefund, Refund,
    )
    from app.modules.lms.models import (  # noqa: F401
        Payment, Expense, LedgerEntry, TeacherWallet,
        SectionContract, IdempotencyKey,
    )
    from app.modules.notifications.models import Notification  # noqa: F401
