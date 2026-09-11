/**
 * Page-level access control.
 *
 * PAGE_PERMISSION_MAP is an *approximation* of default access used only while
 * /auth/me/permissions is still in flight, so the sidebar doesn't flash empty on
 * first paint. Once permissions have loaded, the database is authoritative:
 * nothing here may grant access that the role's permissions do not include,
 * otherwise revoking a permission in the Roles page silently has no effect.
 */

export const PAGE_PERMISSION_MAP: Record<string, string[]> = {
  page_dashboard: ["superadmin", "manager", "secretary", "teacher", "marketing_manager"],
  page_users: ["superadmin"],
  page_employees: ["superadmin", "manager"],
  page_roles: ["superadmin"],
  page_courses: ["superadmin", "manager", "secretary", "teacher"],
  page_sections: ["superadmin", "manager", "secretary", "teacher"],
  page_certificates: ["superadmin", "manager", "secretary", "teacher"],
  page_students: ["superadmin", "manager", "secretary"],
  page_enrollments: ["superadmin", "manager", "secretary", "teacher"],
  page_attendance: ["superadmin", "manager", "secretary", "teacher"],
  page_gradebook: ["superadmin", "manager", "secretary", "teacher"],
  page_payments: ["superadmin", "manager", "secretary"],
  page_expenses: ["superadmin", "manager", "secretary"],
  page_financial_records: ["superadmin", "manager", "secretary"],
  page_revenue: ["superadmin", "manager"],
  page_teacher_wallet: ["superadmin", "manager", "teacher"],
  page_daily_closures: ["superadmin", "manager", "secretary"],
  page_pos: ["superadmin", "manager", "secretary"],
  page_cashier_refunds: ["superadmin", "manager", "accountant", "secretary"],
  page_ingestion: ["superadmin", "teacher"],
  page_health: ["superadmin"],
  page_backups: ["superadmin"],
  page_settings: ["superadmin", "manager", "secretary", "teacher"],
  page_staff_payroll: ["superadmin", "manager", "secretary"],
  page_reports: ["superadmin", "manager", "secretary"],
  page_notifications: ["superadmin", "manager", "secretary", "teacher"],
  page_wizards: ["superadmin", "manager", "secretary"],
  page_search: ["superadmin", "manager", "secretary", "teacher"],
  page_content: ["superadmin", "marketing_manager"],
  page_announcements: ["superadmin", "marketing_manager"],
  page_contacts: ["superadmin", "marketing_manager"],
  page_bookings: ["superadmin", "manager", "secretary", "marketing_manager"],
};

export interface PermissionSubject {
  is_superadmin?: boolean;
  role?: { name?: string } | null;
}

export function hasPageAccess(
  user: PermissionSubject | null | undefined,
  permissions: string[],
  permissionsLoaded: boolean,
  permissionCodename: string,
): boolean {
  if (user?.is_superadmin) return true;

  // Loaded permissions are the source of truth, even when the list is empty.
  if (permissionsLoaded) {
    return permissions.includes(permissionCodename);
  }

  const fallbackRoles = PAGE_PERMISSION_MAP[permissionCodename] || [];
  return fallbackRoles.includes(user?.role?.name ?? "");
}
