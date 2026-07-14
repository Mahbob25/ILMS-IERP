"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { apiClient } from "@/lib/api";
import { useAuth } from "@/components/AuthContext";
import RefreshButton from "@/components/RefreshButton";
import ConfirmModal from "@/components/ConfirmModal";
import Modal from "@/components/Modal";
import Select from "@/components/ui/Select";
import {
  Plus, Pencil, Trash2, Loader2, Search, Shield, AlertCircle,
  UserCog, UserCheck, User, Users as UsersIcon,
} from "lucide-react";
import { sanitizeInput } from "@/lib/utils/input";

interface RoleInfo {
  id: string;
  name: string;
}

interface AppUser {
  id: string;
  email: string;
  full_name: string | null;
  locale_pref: string;
  is_active: boolean;
  is_superadmin: boolean;
  role: RoleInfo;
  employee_id?: string | null;
}

interface EmployeeOption {
  id: string;
  full_name: string;
  employee_type: string;
  has_user_account: boolean;
}

const ROLE_COLORS: Record<string, string> = {
  superadmin: "bg-red-50 text-red-600 border-red-100",
  manager: "bg-blue-50 text-blue-600 border-blue-100",
  secretary: "bg-amber-50 text-amber-600 border-amber-100",
  teacher: "bg-emerald-50 text-emerald-600 border-emerald-100",
  cleaner: "bg-orange-50 text-orange-600 border-orange-100",
};

const ROLE_ICONS: Record<string, React.ReactNode> = {
  superadmin: <Shield size={14} />,
  manager: <UserCog size={14} />,
  secretary: <UserCheck size={14} />,
  teacher: <User size={14} />,
  cleaner: <User size={14} />,
};

export default function UsersPage() {
  const params = useParams();
  const { user: authUser } = useAuth();
  const locale = (params?.locale as string) || "ar";
  const isRtl = locale === "ar";

  const t = {
    ar: {
      title: "إدارة المستخدمين",
      subtitle: "إدارة حسابات النظام والأدوار الوظيفية",
      fullName: "الاسم الكامل",
      email: "البريد الإلكتروني",
      role: "الدور الوظيفي",
      status: "الحالة",
      active: "نشط",
      inactive: "غير نشط",
      actions: "الإجراءات",
      add: "إضافة مستخدم",
      edit: "تعديل",
      deactivate: "تعطيل",
      reactivate: "إعادة تفعيل",
      save: "حفظ",
      cancel: "إلغاء",
      loading: "جاري التحميل...",
      empty: "لا يوجد مستخدمين",
      confirmDeactivateTitle: "تأكيد التعطيل",
      confirmDeactivate: "هل أنت متأكد من تعطيل هذا المستخدم؟",
      confirmReactivateTitle: "تأكيد إعادة التفعيل",
      confirmReactivate: "هل أنت متأكد من إعادة تفعيل هذا المستخدم؟",
      deactivated: "تم تعطيل المستخدم بنجاح",
      reactivated: "تم إعادة تفعيل المستخدم بنجاح",
      actionFailed: "فشل العملية",
      yes: "نعم",
      no: "لا",
      password: "كلمة المرور",
      search: "بحث بالاسم أو البريد...",
      createTitle: "إضافة مستخدم جديد",
      editTitle: "تعديل بيانات المستخدم",
      all: "الكل",
      localePref: "اللغة",
      arabic: "العربية",
      english: "English",
      selectEmployee: "اختر موظف...",
      passwordRequirements: "كلمة المرور يجب أن تحتوي على الأقل 8 أحرف، حرف كبير، حرف صغير، رقم، وحرف خاص",
      noEmployeesAvailable: "لا يوجد موظفون بدون حسابات",
      fetchEmployeesFailed: "فشل تحميل الموظفين",
    },
    en: {
      title: "User Management",
      subtitle: "Manage system accounts and roles",
      fullName: "Full Name",
      email: "Email",
      role: "Role",
      status: "Status",
      active: "Active",
      inactive: "Inactive",
      actions: "Actions",
      add: "Add User",
      edit: "Edit",
      deactivate: "Deactivate",
      reactivate: "Reactivate",
      save: "Save",
      cancel: "Cancel",
      loading: "Loading...",
      empty: "No users found",
      confirmDeactivateTitle: "Confirm Deactivation",
      confirmDeactivate: "Are you sure you want to deactivate this user?",
      confirmReactivateTitle: "Confirm Reactivation",
      confirmReactivate: "Are you sure you want to reactivate this user?",
      deactivated: "User deactivated successfully",
      reactivated: "User reactivated successfully",
      actionFailed: "Action failed",
      yes: "Yes",
      no: "No",
      password: "Password",
      search: "Search by name or email...",
      createTitle: "Add New User",
      editTitle: "Edit User",
      all: "All",
      localePref: "Language",
      arabic: "Arabic",
      english: "English",
      selectEmployee: "Select employee...",
      passwordRequirements: "Password must be at least 8 characters with uppercase, lowercase, digit, and special character",
      noEmployeesAvailable: "No employees without accounts",
      fetchEmployeesFailed: "Failed to load employees",
    },
  }[locale === "en" ? "en" : "ar"];

  const [users, setUsers] = useState<AppUser[]>([]);
  const [roles, setRoles] = useState<RoleInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [form, setForm] = useState({ email: "", password: "", role_id: "", locale_pref: "ar", employee_id: "" });
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [employeesLoading, setEmployeesLoading] = useState(false);
  const [employeesError, setEmployeesError] = useState<string | null>(null);
  const [toggleTarget, setToggleTarget] = useState<AppUser | null>(null);
  const [toggleAction, setToggleAction] = useState<"deactivate" | "reactivate">("deactivate");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const extractApiError = (e: any): string => {
    const detail = e?.response?.data?.detail;
    if (!detail) return "";
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) {
      return detail.map((d: any) => d.msg || d.message).filter(Boolean).join("; ");
    }
    return String(detail);
  };

  const translateError = (msg: string): string => {
    if (!isRtl) return msg;
    const translations: Record<string, string> = {
      "Password must contain at least one lowercase letter": "كلمة المرور يجب أن تحتوي على حرف صغير واحد على الأقل",
      "Password must contain at least one uppercase letter": "كلمة المرور يجب أن تحتوي على حرف كبير واحد على الأقل",
      "Password must contain at least one digit": "كلمة المرور يجب أن تحتوي على رقم واحد على الأقل",
      "Password must contain at least one special character": "كلمة المرور يجب أن تحتوي على حرف خاص واحد على الأقل",
      "String should have at least 8 characters": "كلمة المرور يجب أن تحتوي على 8 أحرف على الأقل",
      "Email address already registered": "البريد الإلكتروني مسجل بالفعل",
      "employee_id is required: every user must be linked to an employee": "يجب ربط المستخدم بموظف",
      "Specified employee does not exist": "الموظف المحدد غير موجود",
      "Specified role ID does not exist": "الدور المحدد غير موجود",
    };
    return translations[msg] || msg;
  };

  const fetchUsers = useCallback(async () => {
    setMessage(null);
    setFetchError(null);
    try {
      const [usersRes, rolesRes] = await Promise.all([
        apiClient.get<AppUser[]>("/users"),
        apiClient.get<{ id: string; name: string }[]>("/users/roles"),
      ]);
      setUsers(usersRes.data);
      setRoles(rolesRes.data);
    } catch (e) {
      setFetchError("Failed to load users");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(null), 6000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  useEffect(() => {
    if (roles.length > 0 && !form.role_id) {
      setForm((f) => ({ ...f, role_id: roles[0].id }));
    }
  }, [roles]);

  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      (u.full_name || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRole = roleFilter === "all" || u.role.name === roleFilter;
    return matchesSearch && matchesRole;
  });

  const openCreate = async () => {
    setForm({
      email: "",
      password: "",
      role_id: roles.find((r) => r.name === "teacher")?.id || roles[0]?.id || "",
      locale_pref: "ar",
      employee_id: "",
    });
    setEditingId(null);
    setShowForm(true);
    setFormError(null);
    setEmployees([]);
    setEmployeesLoading(true);
    setEmployeesError(null);
    try {
      const res = await apiClient.get<EmployeeOption[]>("/employees?has_account=false");
      setEmployees(res.data);
    } catch (e: any) {
      setEmployeesError(translateError(extractApiError(e) || e?.message || t.fetchEmployeesFailed));
      console.error("Failed to fetch employees", e);
    } finally {
      setEmployeesLoading(false);
    }
  };

  const openEdit = (target: AppUser) => {
    setForm({
      email: target.email,
      password: "",
      role_id: target.role.id,
      locale_pref: target.locale_pref,
      employee_id: target.employee_id || "",
    });
    setEditingId(target.id);
    setShowForm(true);
    setFormError(null);
  };

  const handleSave = async () => {
    setSubmitting(true);
    try {
      if (editingId) {
        const payload: Record<string, unknown> = {};
        if (form.email) payload.email = sanitizeInput(form.email);
        if (form.password) payload.password = form.password;
        payload.role_id = form.role_id;
        payload.locale_pref = form.locale_pref;
        await apiClient.put(`/users/${editingId}`, payload);
      } else {
        await apiClient.post("/users", {
          email: sanitizeInput(form.email),
          password: form.password,
          role_id: form.role_id,
          locale_pref: form.locale_pref,
          employee_id: form.employee_id,
        });
      }
      setShowForm(false);
      setEditingId(null);
      setSubmitting(false);
      fetchUsers();
    } catch (e: any) {
      setSubmitting(false);
      setFormError(extractApiError(e) || t.actionFailed);
    }
  };

  const handleToggleActive = async () => {
    if (!toggleTarget) return;
    try {
      await apiClient.put(`/users/${toggleTarget.id}`, { is_active: toggleAction === "reactivate" });
      setToggleTarget(null);
      setMessage({
        type: "success",
        text: toggleAction === "deactivate" ? t.deactivated : t.reactivated,
      });
      fetchUsers();
    } catch (e: any) {
      setToggleTarget(null);
      const detail = extractApiError(e) || t.actionFailed;
      setMessage({ type: "error", text: detail });
    }
  };

  const promptDeactivate = (target: AppUser) => {
    setToggleTarget(target);
    setToggleAction("deactivate");
  };

  const promptReactivate = (target: AppUser) => {
    setToggleTarget(target);
    setToggleAction("reactivate");
  };

  const roleOptions = roles.filter(
    (r) => r.name !== "superadmin" || authUser?.is_superadmin
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="animate-spin text-slate-400" size={24} />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto animate-fade-in" dir={isRtl ? "rtl" : "ltr"}>
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">{t.title}</h2>
          <p className="text-sm text-slate-500 mt-1">{t.subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={16} className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t.search}
              className="input-field ps-9 pe-3 w-56"
            />
          </div>
          <RefreshButton onRefresh={fetchUsers} />
          <button onClick={openCreate} className="btn-primary flex items-center gap-2">
            <Plus size={16} />
            <span>{t.add}</span>
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setRoleFilter("all")}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
            roleFilter === "all"
              ? "bg-slate-900 text-white border-slate-900"
              : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
          }`}
        >
          {t.all}
        </button>
        {["superadmin", "manager", "secretary", "teacher", "cleaner"].map((roleName) => {
          const roleExists = users.some((u) => u.role.name === roleName);
          if (!roleExists) return null;
          return (
            <button
              key={roleName}
              onClick={() => setRoleFilter(roleName)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all flex items-center gap-1.5 ${
                roleFilter === roleName
                  ? "bg-slate-900 text-white border-slate-900"
                  : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
              }`}
            >
              {ROLE_ICONS[roleName]}
              <span className="capitalize">{roleName}</span>
            </button>
          );
        })}
      </div>

      {message && (
        <div className={`px-4 py-3 rounded-lg text-sm font-medium ${
          message.type === "success"
            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
            : "bg-red-50 text-red-700 border border-red-200"
        }`}>
          {message.text}
        </div>
      )}

      {fetchError && (
        <div className="px-4 py-3 rounded-lg text-sm font-medium bg-red-50 text-red-700 border border-red-200 flex items-center gap-2">
          <AlertCircle size={16} />
          {fetchError}
        </div>
      )}

      <Modal open={showForm} onClose={() => { setShowForm(false); setFormError(null); }} title={editingId ? t.editTitle : t.createTitle} size="xl">
        <div className="space-y-6">
          {formError && (
            <div className="px-4 py-3 rounded-lg text-sm font-medium bg-red-50 text-red-700 border border-red-200" dir={isRtl ? "rtl" : "ltr"}>
              {translateError(formError)}
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">{t.fullName}</label>
              {editingId ? (
                <input
                  type="text"
                  value={users.find((u) => u.id === editingId)?.full_name || ""}
                  className="input-field bg-slate-50 text-slate-500"
                  disabled
                  placeholder={t.fullName}
                />
              ) : employeesLoading ? (
                <div className="input-field flex items-center gap-2 text-slate-400">
                  <Loader2 size={14} className="animate-spin" />
                  <span className="text-sm">{t.loading}</span>
                </div>
              ) : employeesError ? (
                <div className="text-xs text-red-500 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {employeesError}
                </div>
              ) : employees.length === 0 ? (
                <div className="text-xs text-slate-400 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                  {t.noEmployeesAvailable}
                </div>
              ) : (
                <Select
                  value={form.employee_id}
                  onChange={(value) => setForm({ ...form, employee_id: value })}
                  options={employees.map((e) => ({ value: e.id, label: e.full_name }))}
                  placeholder={t.selectEmployee}
                  searchable
                  isRtl={isRtl}
                />
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">{t.email}</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">{t.password}</label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="input-field"
                placeholder={editingId ? (isRtl ? "(اتركه فارغًا للاحتفاظ)" : "(leave empty to keep)") : ""}
              />
              {!editingId && (
                <p className="mt-1 text-[11px] text-slate-400">{t.passwordRequirements}</p>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">{t.role}</label>
              <Select
                value={form.role_id}
                onChange={(value) => setForm({ ...form, role_id: value })}
                options={roleOptions.map((r) => ({ value: r.id, label: r.name }))}
              />
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={handleSave} disabled={submitting} className="btn-primary">{submitting ? <Loader2 size={16} className="animate-spin" /> : t.save}</button>
            <button onClick={() => setShowForm(false)} className="btn-secondary">{t.cancel}</button>
          </div>
        </div>
      </Modal>

      {filteredUsers.length === 0 ? (
        <div className="card p-8 text-center text-sm text-slate-500">{t.empty}</div>
      ) : (
        <div className="card overflow-hidden">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t.fullName}</th>
                <th>{t.email}</th>
                <th>{t.role}</th>
                <th>{t.status}</th>
                <th>{t.actions}</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((u) => {
                const isSelf = u.id === authUser?.id;
                return (
                  <tr key={u.id} className={!u.is_active ? "opacity-60" : ""}>
                    <td className="font-medium text-slate-900">
                      <span className="flex items-center gap-2">
                        {ROLE_ICONS[u.role.name] || null}
                        {u.full_name}
                        {isSelf && (
                          <span className="text-[10px] text-slate-400 font-normal">(you)</span>
                        )}
                      </span>
                    </td>
                    <td className="text-slate-600">{u.email}</td>
                    <td>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${ROLE_COLORS[u.role.name] || "bg-slate-50 text-slate-600"}`}>
                        {ROLE_ICONS[u.role.name]}
                        <span className="capitalize">{u.role.name}</span>
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${u.is_active ? "badge-success" : "bg-red-50 text-red-600 border border-red-100"}`}>
                        {u.is_active ? t.active : t.inactive}
                      </span>
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        <button onClick={() => openEdit(u)} className="btn-icon" title={t.edit}>
                          <Pencil size={15} />
                        </button>
                        {!isSelf && u.is_active && (
                          <button
                            onClick={() => promptDeactivate(u)}
                            className="btn-icon text-red-500"
                            title={t.deactivate}
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
                        {!isSelf && !u.is_active && (
                          <button
                            onClick={() => promptReactivate(u)}
                            className="btn-icon text-emerald-500"
                            title={t.reactivate}
                          >
                            <UserCheck size={15} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmModal
        open={toggleTarget !== null}
        title={toggleAction === "deactivate" ? t.confirmDeactivateTitle : t.confirmReactivateTitle}
        message={
          toggleTarget
            ? `${toggleAction === "deactivate" ? t.confirmDeactivate : t.confirmReactivate} (${toggleTarget.full_name})`
            : ""
        }
        confirmLabel={t.yes}
        cancelLabel={t.no}
        isRtl={isRtl}
        onConfirm={handleToggleActive}
        onCancel={() => setToggleTarget(null)}
      />
    </div>
  );
}
