import uuid
from datetime import date, datetime
from typing import Optional, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import joinedload
from sqlalchemy import func
from app.modules.identity.models import User, Role, Employee, EmployeeType, CompensationType, Permission, RolePermission, AuditLog
from app.modules.lms.models import TeacherWallet, AttendanceSession, Assignment, Grade, Submission
from app.modules.academic.models import CourseSection, Course
from app.modules.identity.schemas import SectionInfo, RecentActivity
from app.modules.identity.security import get_password_hash


async def create_audit_log(
    db: AsyncSession,
    action: str,
    user_id: Optional[uuid.UUID] = None,
    payload: Optional[Dict[str, Any]] = None,
    ip_address: Optional[str] = None
) -> AuditLog:
    audit_entry = AuditLog(
        user_id=user_id,
        action=action,
        payload=payload,
        ip_address=ip_address
    )
    db.add(audit_entry)
    await db.flush()
    return audit_entry


async def get_teachers_with_stats(db: AsyncSession) -> list[dict]:
    employees_result = await db.execute(
        select(Employee).where(
            Employee.employee_type == EmployeeType.TEACHER
        ).order_by(Employee.full_name)
    )
    teachers = employees_result.scalars().all()

    result = []
    for t in teachers:
        sections_count = await db.scalar(
            select(func.count()).select_from(CourseSection).where(CourseSection.teacher_id == t.id)
        ) or 0

        wallet = await db.execute(
            select(TeacherWallet).where(TeacherWallet.teacher_id == t.id)
        )
        wallet_obj = wallet.scalar_one_or_none()

        result.append({
            "id": t.id,
            "full_name": t.full_name,
            "employee_type": t.employee_type.value,
            "is_active": t.is_active,
            "sections_count": sections_count,
            "wallet_balance": float(wallet_obj.balance) if wallet_obj else 0.0,
            "wallet_last_updated": wallet_obj.last_updated.isoformat() if wallet_obj and wallet_obj.last_updated else None,
        })
    return result


async def get_teacher_detail(db: AsyncSession, employee_id: uuid.UUID) -> Optional[dict]:
    result = await db.execute(
        select(Employee).options(joinedload(Employee.user)).where(Employee.id == employee_id)
    )
    emp = result.scalar_one_or_none()
    if not emp:
        return None

    sections_result = await db.execute(
        select(CourseSection)
        .options(joinedload(CourseSection.course))
        .where(CourseSection.teacher_id == employee_id)
    )
    sections = sections_result.unique().scalars().all()

    section_infos = [
        SectionInfo(
            id=s.id,
            course_name=s.course.name,
            enrolled_count=s.enrolled_count,
            capacity=s.capacity,
            status=s.status,
        )
        for s in sections
    ]

    section_ids = [s.id for s in sections]
    recent_activity = []
    user_id = emp.user.id if emp.user else None

    if section_ids and user_id:
        grades_result = await db.execute(
            select(Grade)
            .join(Submission, Grade.submission_id == Submission.id)
            .join(Assignment, Submission.assignment_id == Assignment.id)
            .join(CourseSection, Assignment.section_id == CourseSection.id)
            .where(
                Grade.graded_by == user_id,
                CourseSection.id.in_(section_ids),
            )
            .order_by(Grade.graded_at.desc())
            .limit(5)
        )
        for g in grades_result.scalars().all():
            recent_activity.append(RecentActivity(
                action="graded",
                detail=f"Grade recorded",
                timestamp=str(g.graded_at),
            ))

        sessions_result = await db.execute(
            select(AttendanceSession)
            .where(
                AttendanceSession.created_by == user_id,
                AttendanceSession.section_id.in_(section_ids),
            )
            .order_by(AttendanceSession.created_at.desc())
            .limit(5)
        )
        for s in sessions_result.scalars().all():
            recent_activity.append(RecentActivity(
                action="session",
                detail=f"Attendance session on {s.date}",
                timestamp=str(s.created_at),
            ))

    recent_activity.sort(key=lambda a: a.timestamp, reverse=True)
    recent_activity = recent_activity[:10]

    wallet_result = await db.execute(
        select(TeacherWallet.balance).where(TeacherWallet.teacher_id == employee_id)
    )
    wallet_balance = float(wallet_result.scalar() or 0.0)

    return {
        "id": emp.id,
        "full_name": emp.full_name,
        "email": emp.user.email if emp.user else None,
        "is_active": emp.is_active,
        "wallet_balance": wallet_balance,
        "sections": section_infos,
        "recent_activity": recent_activity,
    }


async def get_user_by_id(db: AsyncSession, user_id: uuid.UUID) -> Optional[User]:
    result = await db.execute(
        select(User).options(joinedload(User.role), joinedload(User.employee)).where(User.id == user_id)
    )
    return result.scalar_one_or_none()


async def update_user(db: AsyncSession, user: User, data: dict) -> User:
    if "password" in data and data["password"]:
        data["password_hash"] = get_password_hash(data.pop("password"))
    for key, value in data.items():
        if value is not None:
            setattr(user, key, value)
    await db.flush()

    result = await db.execute(
        select(User).options(joinedload(User.role)).where(User.id == user.id)
    )
    return result.scalar_one()


async def soft_delete_user(db: AsyncSession, user: User) -> User:
    user.is_active = False
    await db.flush()

    result = await db.execute(
        select(User).options(joinedload(User.role)).where(User.id == user.id)
    )
    return result.scalar_one()


# --- Employee Service ---

async def list_employees(
    db: AsyncSession,
    employee_type: Optional[str] = None,
    search: Optional[str] = None,
) -> list[dict]:
    query = select(Employee).order_by(Employee.full_name)

    if employee_type:
        try:
            type_enum = EmployeeType(employee_type)
            query = query.where(Employee.employee_type == type_enum)
        except ValueError:
            pass

    if search:
        query = query.where(Employee.full_name.ilike(f"%{search}%"))

    result = await db.execute(query)
    employees = result.scalars().all()

    output = []
    for emp in employees:
        has_user = False
        user_result = await db.execute(
            select(User.id).where(User.employee_id == emp.id).limit(1)
        )
        has_user = user_result.first() is not None

        output.append({
            "id": emp.id,
            "full_name": emp.full_name,
            "employee_type": emp.employee_type.value if hasattr(emp.employee_type, 'value') else emp.employee_type,
            "phone_number": emp.phone_number,
            "salary": emp.salary,
            "compensation_type": emp.compensation_type.value if hasattr(emp.compensation_type, 'value') else emp.compensation_type,
            "default_percentage": float(emp.default_percentage) if emp.default_percentage is not None else None,
            "hire_date": str(emp.hire_date) if emp.hire_date else None,
            "contract_end_date": str(emp.contract_end_date) if emp.contract_end_date else None,
            "address": emp.address,
            "is_active": emp.is_active,
            "has_user_account": has_user,
        })
    return output


async def get_employee_by_id(db: AsyncSession, employee_id: uuid.UUID) -> Optional[Employee]:
    result = await db.execute(
        select(Employee).where(Employee.id == employee_id)
    )
    return result.scalar_one_or_none()


async def get_employee_detail(db: AsyncSession, employee_id: uuid.UUID) -> Optional[dict]:
    result = await db.execute(
        select(Employee).where(Employee.id == employee_id)
    )
    emp = result.scalar_one_or_none()
    if not emp:
        return None

    linked_user = None
    user_result = await db.execute(
        select(User).options(joinedload(User.role)).where(User.employee_id == emp.id)
    )
    user = user_result.scalar_one_or_none()
    if user:
        linked_user = {
            "id": user.id,
            "email": user.email,
            "role_name": user.role.name,
            "is_active": user.is_active,
            "is_superadmin": user.is_superadmin,
        }

    return {
        "id": emp.id,
        "full_name": emp.full_name,
        "employee_type": emp.employee_type.value if hasattr(emp.employee_type, 'value') else emp.employee_type,
        "phone_number": emp.phone_number,
        "salary": emp.salary,
        "compensation_type": emp.compensation_type.value if hasattr(emp.compensation_type, 'value') else emp.compensation_type,
        "default_percentage": float(emp.default_percentage) if emp.default_percentage is not None else None,
        "hire_date": str(emp.hire_date) if emp.hire_date else None,
        "contract_end_date": str(emp.contract_end_date) if emp.contract_end_date else None,
        "address": emp.address,
        "is_active": emp.is_active,
        "linked_user": linked_user,
    }


async def create_employee(db: AsyncSession, data: dict) -> Employee:
    try:
        type_enum = EmployeeType(data["employee_type"])
    except ValueError:
        raise ValueError(f"Invalid employee type: {data['employee_type']}")

    comp_type_str = data.get("compensation_type", "salary")
    try:
        comp_type = CompensationType(comp_type_str)
    except ValueError:
        raise ValueError(f"Invalid compensation type: {comp_type_str}")

    salary_value = data.get("salary")
    if comp_type == CompensationType.PERCENTAGE:
        salary_value = 0

    default_pct = data.get("default_percentage")
    if default_pct is not None and comp_type == CompensationType.SALARY:
        default_pct = None

    employee = Employee(
        full_name=data["full_name"],
        employee_type=type_enum,
        compensation_type=comp_type,
        default_percentage=default_pct,
        phone_number=data.get("phone_number"),
        salary=salary_value,
        hire_date=data.get("hire_date"),
        contract_end_date=data.get("contract_end_date"),
        address=data.get("address"),
    )
    db.add(employee)
    await db.flush()

    result = await db.execute(
        select(Employee).where(Employee.id == employee.id)
    )
    return result.scalar_one()


async def update_employee(db: AsyncSession, employee: Employee, data: dict) -> Employee:
    if "employee_type" in data and data["employee_type"]:
        try:
            data["employee_type"] = EmployeeType(data["employee_type"])
        except ValueError:
            raise ValueError(f"Invalid employee type: {data['employee_type']}")

    if "compensation_type" in data and data["compensation_type"]:
        try:
            data["compensation_type"] = CompensationType(data["compensation_type"])
        except ValueError:
            raise ValueError(f"Invalid compensation type: {data['compensation_type']}")

    if "default_percentage" in data and data["default_percentage"] is not None:
        comp_type = data.get("compensation_type", employee.compensation_type)
        if comp_type == CompensationType.SALARY:
            data["default_percentage"] = None

    if "salary" in data:
        comp_type = data.get("compensation_type", employee.compensation_type)
        if comp_type == CompensationType.PERCENTAGE:
            data["salary"] = 0

    for key, value in data.items():
        if value is not None:
            setattr(employee, key, value)
    await db.flush()

    result = await db.execute(
        select(Employee).where(Employee.id == employee.id)
    )
    return result.scalar_one()


async def soft_delete_employee(db: AsyncSession, employee: Employee) -> Employee:
    employee.is_active = False
    await db.flush()

    result = await db.execute(
        select(Employee).where(Employee.id == employee.id)
    )
    return result.scalar_one()


async def grant_user_access(
    db: AsyncSession,
    employee_id: uuid.UUID,
    email: str,
    password: str,
    role_id: uuid.UUID,
) -> User:
    if len(password) < 8:
        raise ValueError("Password must be at least 8 characters")
    if not any(c.islower() for c in password):
        raise ValueError("Password must contain at least one lowercase letter")
    if not any(c.isupper() for c in password):
        raise ValueError("Password must contain at least one uppercase letter")
    if not any(c.isdigit() for c in password):
        raise ValueError("Password must contain at least one digit")
    if not any(c in "!@#$%^&*()_+-=[]{}|;':\",./<>?" for c in password):
        raise ValueError("Password must contain at least one special character")

    employee = await get_employee_by_id(db, employee_id)
    if not employee:
        raise ValueError("Employee not found")

    existing = await db.execute(select(User).where(User.email == email))
    if existing.scalar_one_or_none():
        raise ValueError("Email already registered")

    hashed_password = get_password_hash(password)
    new_user = User(
        email=email,
        password_hash=hashed_password,
        role_id=role_id,
        employee_id=employee_id,
        locale_pref="ar",
    )
    db.add(new_user)
    await db.flush()

    result = await db.execute(
        select(User).options(joinedload(User.role), joinedload(User.employee)).where(User.id == new_user.id)
    )
    return result.scalar_one()


async def revoke_user_access(db: AsyncSession, employee_id: uuid.UUID) -> None:
    result = await db.execute(
        select(User).where(User.employee_id == employee_id)
    )
    user = result.scalar_one_or_none()
    if user:
        user.is_active = False
        await db.flush()


# --- Permission Service ---

async def get_all_permissions(db: AsyncSession) -> list[Permission]:
    result = await db.execute(select(Permission).order_by(Permission.group, Permission.codename))
    return result.scalars().all()


async def get_role_permissions(db: AsyncSession, role_id: uuid.UUID) -> list[str]:
    result = await db.execute(
        select(Permission.codename)
        .join(RolePermission, Permission.id == RolePermission.permission_id)
        .where(RolePermission.role_id == role_id)
        .order_by(Permission.codename)
    )
    return [row[0] for row in result.fetchall()]


async def set_role_permissions(db: AsyncSession, role_id: uuid.UUID, codenames: list[str]) -> None:
    # Verify role exists
    role_result = await db.execute(select(Role).where(Role.id == role_id))
    if not role_result.scalar_one_or_none():
        raise ValueError("Role not found")

    # Remove existing permissions
    await db.execute(
        select(RolePermission).where(RolePermission.role_id == role_id)
    )
    await db.execute(
        RolePermission.__table__.delete().where(RolePermission.role_id == role_id)
    )

    # Look up permission IDs
    if codenames:
        perm_result = await db.execute(
            select(Permission).where(Permission.codename.in_(codenames))
        )
        permissions = perm_result.scalars().all()

        for perm in permissions:
            db.add(RolePermission(role_id=role_id, permission_id=perm.id))

    await db.flush()


async def get_user_permissions(db: AsyncSession, user: User) -> list[str]:
    if user.is_superadmin:
        result = await db.execute(select(Permission.codename))
        return [row[0] for row in result.fetchall()]

    return await get_role_permissions(db, user.role_id)


async def create_role(db: AsyncSession, name: str) -> Role:
    role = Role(name=name)
    db.add(role)
    await db.flush()

    result = await db.execute(select(Role).where(Role.id == role.id))
    return result.scalar_one()
