from app.modules.reports import service as reports_service
from app.modules.reports.schemas import ReportCatalogResponse

EXPECTED_CODES = {
    "pnl_summary",
    "daily_ledger",
    "closures_register",
    "daily_reconciliation",
    "student_register",
    "enrollment_summary",
    "section_occupancy",
    "attendance_summary",
    "teacher_wallets",
    "teacher_payouts",
    "staff_payroll",
    "grade_summary",
}


async def test_catalog_lists_all_reports():
    catalog: ReportCatalogResponse = await reports_service.list_report_catalog()

    assert len(catalog.reports) == 12
    assert {r.code for r in catalog.reports} == EXPECTED_CODES


async def test_catalog_has_expected_categories():
    catalog = await reports_service.list_report_catalog()

    categories = {r.category for r in catalog.reports}
    assert categories == {"financial", "operational", "teacher_hr"}

    financial_codes = {r.code for r in catalog.reports if r.category == "financial"}
    assert financial_codes == {
        "pnl_summary",
        "daily_ledger",
        "closures_register",
        "daily_reconciliation",
    }


async def test_catalog_paths_are_unique_and_valid_inputs():
    catalog = await reports_service.list_report_catalog()

    paths = [r.path for r in catalog.reports]
    assert len(paths) == len(set(paths))

    valid_inputs = {"date_range", "single_date", "single_month"}
    for report in catalog.reports:
        assert set(report.inputs) <= valid_inputs
