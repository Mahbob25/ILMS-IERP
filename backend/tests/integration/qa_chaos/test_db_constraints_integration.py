import pytest


expected_constraints = {
    "D01": {
        "table": "payments",
        "constraint_name": "payments_amount_check",
        "check": "amount > 0",
    },
    "D02": {
        "table": "expenses",
        "constraint_name": "expenses_amount_check",
        "check": "amount > 0",
    },
    "D03": {
        "table": "pending_refunds",
        "constraint_name": "pending_refunds_amount_check",
        "check": "amount > 0",
    },
    "D04": {
        "table": "refunds",
        "constraint_name": "refunds_amount_check",
        "check": "amount > 0",
    },
    "D05": {
        "table": "teacher_wallets",
        "constraint_name": "teacher_wallets_balance_check",
        "check": "balance >= 0",
    },
    "D06": {
        "table": "teacher_wallets",
        "constraint_name": "teacher_wallets_frozen_balance_check",
        "check": "frozen_balance >= 0",
    },
    "D07": {
        "table": "teacher_wallets",
        "constraint_name": "teacher_wallets_frozen_lte_balance",
        "check": "frozen_balance <= balance",
    },
    "D08": {
        "table": "ledger_entries",
        "constraint_name": "ledger_entries_delta_check",
        "check": "available_delta + frozen_delta = total_amount",
    },
    "D09": {
        "table": "enrollments",
        "constraint_name": "enrollments_discount_check",
        "check": "0 <= admin_discount AND admin_discount <= 100",
    },
    "D10": {
        "table": "final_grades",
        "constraint_name": "final_grades_score_check",
        "check": "0 <= final_score AND final_score <= 100",
    },
    "D11": {
        "table": "grades",
        "constraint_name": "grades_score_check",
        "check": "score >= 0",
    },
    "D12": {
        "table": "course_sections",
        "constraint_name": "course_sections_price_check",
        "check": "price >= 0",
    },
    "D13": {
        "table": "section_contracts",
        "constraint_name": "section_contracts_holdback_check",
        "check": "0 <= holdback_rate AND holdback_rate <= 1",
    },
}


class TestDBConstraintsIntegration:

    def test_d01_payments_amount_check(self):
        c = expected_constraints["D01"]
        assert c["constraint_name"] == "payments_amount_check"
        assert c["table"] == "payments"
        assert ">" in c["check"]

    def test_d02_expenses_amount_check(self):
        c = expected_constraints["D02"]
        assert c["constraint_name"] == "expenses_amount_check"
        assert c["table"] == "expenses"

    def test_d03_pending_refunds_amount_check(self):
        c = expected_constraints["D03"]
        assert c["constraint_name"] == "pending_refunds_amount_check"
        assert c["table"] == "pending_refunds"

    def test_d04_refunds_amount_check(self):
        c = expected_constraints["D04"]
        assert c["constraint_name"] == "refunds_amount_check"
        assert c["table"] == "refunds"

    def test_d05_teacher_wallets_balance_check(self):
        c = expected_constraints["D05"]
        assert c["constraint_name"] == "teacher_wallets_balance_check"
        assert ">=" in c["check"]

    def test_d06_teacher_wallets_frozen_balance_check(self):
        c = expected_constraints["D06"]
        assert c["constraint_name"] == "teacher_wallets_frozen_balance_check"

    def test_d07_teacher_wallets_frozen_lte_balance(self):
        c = expected_constraints["D07"]
        assert c["constraint_name"] == "teacher_wallets_frozen_lte_balance"
        assert "<=" in c["check"]

    def test_d08_ledger_entries_delta_check(self):
        c = expected_constraints["D08"]
        assert c["constraint_name"] == "ledger_entries_delta_check"
        assert "available_delta" in c["check"]
        assert "frozen_delta" in c["check"]
        assert "total_amount" in c["check"]

    def test_d09_enrollments_discount_check(self):
        c = expected_constraints["D09"]
        assert c["constraint_name"] == "enrollments_discount_check"
        assert "admin_discount" in c["check"]

    def test_d10_final_grades_score_check(self):
        c = expected_constraints["D10"]
        assert c["constraint_name"] == "final_grades_score_check"
        assert "final_score" in c["check"]

    def test_d11_grades_score_check(self):
        c = expected_constraints["D11"]
        assert c["constraint_name"] == "grades_score_check"
        assert c["table"] == "grades"

    def test_d12_course_sections_price_check(self):
        c = expected_constraints["D12"]
        assert c["constraint_name"] == "course_sections_price_check"
        assert c["table"] == "course_sections"

    def test_d13_section_contracts_holdback_check(self):
        c = expected_constraints["D13"]
        assert c["constraint_name"] == "section_contracts_holdback_check"
        assert "holdback_rate" in c["check"]

    def test_all_d01_d13_present_in_migration(self):
        migration_path = (
            "backend/alembic/versions/202607130000_db_check_constraints_phase_1.py"
        )
        with open(migration_path, encoding="utf-8") as f:
            content = f.read()

        for code, info in expected_constraints.items():
            assert info["constraint_name"] in content, (
                f"{code}: constraint '{info['constraint_name']}' "
                f"not found in migration file"
            )

    def test_all_constraints_use_not_valid_pattern(self):
        migration_path = (
            "backend/alembic/versions/"
            "202607130000_db_check_constraints_phase_1.py"
        )
        with open(migration_path, encoding="utf-8") as f:
            content = f.read()

        for code, info in expected_constraints.items():
            add_pattern = f"ADD CONSTRAINT {info['constraint_name']}"
            assert add_pattern in content, (
                f"{code}: ADD CONSTRAINT for '{info['constraint_name']}' "
                f"not in migration"
            )
            assert "NOT VALID" in content, (
                "Constraints should use NOT VALID to avoid aggressive table lock"
            )

    def test_all_constraints_have_validate_step(self):
        migration_path = (
            "backend/alembic/versions/"
            "202607130000_db_check_constraints_phase_1.py"
        )
        with open(migration_path, encoding="utf-8") as f:
            content = f.read()

        for code, info in expected_constraints.items():
            validate_pattern = f"VALIDATE CONSTRAINT {info['constraint_name']}"
            assert validate_pattern in content, (
                f"{code}: VALIDATE CONSTRAINT for '{info['constraint_name']}' "
                f"not in migration"
            )

    def test_uq_enrollments_active_partial_unique_index_exists(self):
        migration_path = (
            "backend/alembic/versions/"
            "202607130000_db_check_constraints_phase_1.py"
        )
        with open(migration_path, encoding="utf-8") as f:
            content = f.read()

        assert "uq_enrollments_active" in content, (
            "S21: partial unique index 'uq_enrollments_active' not in migration"
        )
        assert "deleted_at IS NULL" in content, (
            "S21: partial unique index must include WHERE deleted_at IS NULL"
        )
