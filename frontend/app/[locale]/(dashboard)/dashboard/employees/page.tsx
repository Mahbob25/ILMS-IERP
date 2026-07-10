"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiClient } from "@/lib/api";
import { useAuth } from "@/components/AuthContext";
import RefreshButton from "@/components/RefreshButton";
import ConfirmModal from "@/components/ConfirmModal";
import Modal from "@/components/Modal";
import Select from "@/components/ui/Select";
import {
  Plus, Pencil, Trash2, Loader2, Eye, Search, Users, X,
  UserCheck, UserX, Shield,
} from "lucide-react";

interface Employee {
  id: string;
  full_name: string;
  employee_type: string;
  phone_number: string | null;
  default_salary: number | null;
  default_percentage: number | null;
  hire_date: string | null;
  contract_end_date: string | null;
  address: string | null;
  is_active: boolean;
  has_user_account: boolean;
}

interface RoleInfo {
  id: string;
  name: string;
}

const EMPLOYEE_TYPES = [
  "teacher", "manager", "secretary", "cleaner",
  "security", "receptionist", "accountant", "maintenance", "other",
];

const TYPE_COLORS: Record<string, string> = {
  teacher: "bg-blue-50 text-blue-600 border-blue-100",
  manager: "bg-emerald-50 text-emerald-600 border-emerald-100",
  secretary: "bg-purple-50 text-purple-600 border-purple-100",
  cleaner: "bg-amber-50 text-amber-600 border-amber-100",
  security: "bg-slate-50 text-slate-600 border-slate-200",
  receptionist: "bg-pink-50 text-pink-600 border-pink-100",
  accountant: "bg-cyan-50 text-cyan-600 border-cyan-100",
  maintenance: "bg-orange-50 text-orange-600 border-orange-100",
  other: "bg-slate-50 text-slate-600 border-slate-200",
};

export default function EmployeesPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const locale = (params?.locale as string) || "ar";
  const isRtl = locale === "ar";

  const t = {
    ar: {
      title: "إدارة الموظفين", subtitle: "إدارة سجلات الموظفين (بيانات الموارد البشرية)",
      fullName: "الاسم الكامل", type: "النوع", phone: "رقم الهاتف",
      salary: "الراتب", hireDate: "تاريخ التعيين", contractEnd: "نهاية العقد",
      address: "العنوان", status: "الحالة", active: "نشط", inactive: "غير نشط",
      actions: "الإجراءات", add: "إضافة موظف", edit: "تعديل", deactivate: "تعطيل",
      save: "حفظ", cancel: "إلغاء", loading: "جاري التحميل...",
      empty: "لا يوجد موظفين بعد", confirmTitle: "تأكيد التعطيل",
      deleted: "تم تعطيل الموظف بنجاح", deleteFailed: "فشل تعطيل الموظف",
      confirmDelete: "هل أنت متأكد من تعطيل هذا الموظف؟", yes: "نعم", no: "لا",
      search: "بحث...", createTitle: "إضافة موظف جديد", editTitle: "تعديل بيانات الموظف",
      deactivated: "معطل", allTypes: "جميع الأنواع", access: "صلاحية النظام",
      hasAccess: "لديه صلاحية", noAccess: "لا توجد صلاحية",
      grantAccess: "منح صلاحية وصول", revokeAccess: "سحب صلاحية الوصول",
      grantTitle: "منح صلاحية وصول للنظام", revokeConfirm: "هل أنت متأكد من سحب صلاحية الوصول؟",
      email: "البريد الإلكتروني", password: "كلمة المرور", role: "الدور",
      userCreated: "تم إنشاء حساب المستخدم بنجاح",
      passwordHint: "8 أحرف على الأقل: حرف كبير، حرف صغير، رقم، رمز خاص",
      compensationType: "نظام التعويض",
      monthlySalary: "راتب شهري",
      percentage: "نسبة مئوية",
      hybrid: "نظام هجين",
      defaultPct: "النسبة الافتراضية (%)",
      compensationSalary: "الراتب",
      manualPaymentHint: "يتم صرف الراتب يدويًا عبر المصروفات",
    },
    en: {
      title: "Employee Management", subtitle: "Manage employee records (HR data)",
      fullName: "Full Name", type: "Type", phone: "Phone",
      salary: "Salary", hireDate: "Hire Date", contractEnd: "Contract End",
      address: "Address", status: "Status", active: "Active", inactive: "Inactive",
      actions: "Actions", add: "Add Employee", edit: "Edit", deactivate: "Deactivate",
      save: "Save", cancel: "Cancel", loading: "Loading...",
      empty: "No employees yet", confirmTitle: "Confirm Deactivation",
      deleted: "Employee deactivated successfully", deleteFailed: "Failed to deactivate employee",
      confirmDelete: "Are you sure you want to deactivate this employee?", yes: "Yes", no: "No",
      search: "Search...", createTitle: "Add New Employee", editTitle: "Edit Employee",
      deactivated: "Deactivated", allTypes: "All Types", access: "System Access",
      hasAccess: "Has Access", noAccess: "No Access",
      grantAccess: "Grant System Access", revokeAccess: "Revoke Access",
      grantTitle: "Grant System Access", revokeConfirm: "Are you sure you want to revoke system access?",
      email: "Email", password: "Password", role: "Role",
      userCreated: "User account created successfully",
      passwordHint: "Min 8 chars: uppercase, lowercase, digit, special character",
      compensationType: "Compensation Type",
      monthlySalary: "Monthly Salary",
      percentage: "Percentage",
      hybrid: "Hybrid",
      defaultPct: "Default Percentage (%)",
      compensationSalary: "Stipend",
      manualPaymentHint: "Salary is disbursed manually via Expenses",
    },
  }[locale === "en" ? "en" : "ar"];

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [roles, setRoles] = useState<RoleInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [form, setForm] = useState({
    full_name: "", employee_type: "",
    phone_number: "", salary: "", hire_date: "",
    contract_end_date: "", address: "",
    compensation_type: "salary", default_percentage: "",
  });
  const [deleteTarget, setDeleteTarget] = useState<Employee | null>(null);
  const [grantTarget, setGrantTarget] = useState<Employee | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<Employee | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [grantForm, setGrantForm] = useState({ email: "", password: "", role_id: "" });
  const [grantError, setGrantError] = useState<string | null>(null);

  const fetchEmployees = useCallback(async () => {
    setMessage(null);
    try {
      const params: Record<string, string> = {};
      if (typeFilter !== "all") params.employee_type = typeFilter;
      if (searchQuery) params.search = searchQuery;
      const [empRes, rolesRes] = await Promise.all([
        apiClient.get<Employee[]>("/employees", { params }),
        apiClient.get<RoleInfo[]>("/users/roles"),
      ]);
      setEmployees(empRes.data);
      setRoles(rolesRes.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [typeFilter, searchQuery]);

  useEffect(() => { fetchEmployees(); }, [fetchEmployees]);

  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(null), 6000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  const canEdit = user?.is_superadmin || user?.role?.name === "manager";

  const filteredEmployees = employees.filter((e) =>
    e.full_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const openCreate = () => {
    setForm({ full_name: "", employee_type: "", phone_number: "", salary: "", hire_date: "", contract_end_date: "", address: "", compensation_type: "salary", default_percentage: "" });
    setEditingId(null);
    setShowForm(true);
  };

  const openEdit = (emp: Employee) => {
    if (emp.employee_type === "teacher") {
      const compType = (emp.default_salary && emp.default_percentage) ? "hybrid"
        : emp.default_salary ? "salary"
        : emp.default_percentage ? "percentage"
        : "salary";
      setForm({
        full_name: emp.full_name,
        employee_type: emp.employee_type,
        phone_number: emp.phone_number || "",
        salary: emp.default_salary?.toString() || "",
        hire_date: emp.hire_date || "",
        contract_end_date: emp.contract_end_date || "",
        address: emp.address || "",
        compensation_type: compType,
        default_percentage: emp.default_percentage?.toString() || "",
      });
    } else {
      setForm({
        full_name: emp.full_name,
        employee_type: emp.employee_type,
        phone_number: emp.phone_number || "",
        salary: emp.default_salary?.toString() || "",
        hire_date: emp.hire_date || "",
        contract_end_date: emp.contract_end_date || "",
        address: emp.address || "",
        compensation_type: "salary",
        default_percentage: "",
      });
    }
    setEditingId(emp.id);
    setShowForm(true);
  };

  const handleSave = async () => {
    try {
      const payload: Record<string, any> = {
        full_name: form.full_name,
        employee_type: form.employee_type,
      };
      if (form.phone_number) payload.phone_number = form.phone_number;
      if (form.employee_type === "teacher") {
        if (form.salary && form.compensation_type !== "percentage") payload.default_salary = parseFloat(form.salary);
        if (form.default_percentage && form.compensation_type !== "salary") payload.default_percentage = parseFloat(form.default_percentage);
      } else {
        if (form.salary) payload.default_salary = parseFloat(form.salary);
      }
      if (form.hire_date) payload.hire_date = form.hire_date;
      if (form.contract_end_date) payload.contract_end_date = form.contract_end_date;
      if (form.address) payload.address = form.address;

      if (editingId) {
        await apiClient.put(`/employees/${editingId}`, payload);
      } else {
        await apiClient.post("/employees", payload);
      }
      setShowForm(false);
      setEditingId(null);
      fetchEmployees();
    } catch (e: any) {
      const detail = e?.response?.data?.detail;
      const text = Array.isArray(detail) ? detail.map((d: any) => d.msg).join("; ") : (detail || "Error");
      setMessage({ type: "error", text });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiClient.delete(`/employees/${id}`);
      setDeleteTarget(null);
      setMessage({ type: "success", text: t.deleted });
      fetchEmployees();
    } catch (e: any) {
      setDeleteTarget(null);
      const detail = e?.response?.data?.detail;
      const text = Array.isArray(detail) ? detail.map((d: any) => d.msg).join("; ") : (detail || t.deleteFailed);
      setMessage({ type: "error", text });
    }
  };

  const handleGrantAccess = async () => {
    if (!grantTarget) return;
    try {
      await apiClient.post(`/employees/${grantTarget.id}/grant-access`, grantForm);
      setGrantTarget(null);
      setGrantForm({ email: "", password: "", role_id: "" });
      setMessage({ type: "success", text: t.userCreated });
      fetchEmployees();
    } catch (e: any) {
      const detail = e?.response?.data?.detail;
      let text = Array.isArray(detail) ? detail.map((d: any) => d.msg).join("; ") : (detail || "Error");
      if (locale === "ar") {
        const arMap: Record<string, string> = {
          "Password must be at least 8 characters": "يجب أن تتكون كلمة المرور من 8 أحرف على الأقل",
          "Password must contain at least one lowercase letter": "يجب أن تحتوي كلمة المرور على حرف صغير واحد على الأقل",
          "Password must contain at least one uppercase letter": "يجب أن تحتوي كلمة المرور على حرف كبير واحد على الأقل",
          "Password must contain at least one digit": "يجب أن تحتوي كلمة المرور على رقم واحد على الأقل",
          "Password must contain at least one special character": "يجب أن تحتوي كلمة المرور على رمز خاص واحد على الأقل",
          "Employee not found": "الموظف غير موجود",
          "Email already registered": "البريد الإلكتروني مسجل بالفعل",
        };
        text = arMap[text] || text;
      }
      setGrantError(text);
    }
  };

  const handleRevokeAccess = async () => {
    if (!revokeTarget) return;
    try {
      await apiClient.post(`/employees/${revokeTarget.id}/revoke-access`);
      setRevokeTarget(null);
      setMessage({ type: "success", text: "Access revoked" });
      fetchEmployees();
    } catch (e: any) {
      setMessage({ type: "error", text: "Failed to revoke access" });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="animate-spin text-slate-400" size={24} />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto animate-fade-in" dir={isRtl ? "rtl" : "ltr"}>
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">{t.title}</h2>
          <p className="text-sm text-slate-500 mt-1">{t.subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={16} className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text" value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t.search} className="input-field ps-9 pe-3 w-48"
            />
          </div>
          <RefreshButton onRefresh={fetchEmployees} />
          {canEdit && (
            <button onClick={openCreate} className="btn-primary flex items-center gap-2">
              <Plus size={16} /><span>{t.add}</span>
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setTypeFilter("all")}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${typeFilter === "all" ? "bg-brand-50 text-brand-600 border-brand-200" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}
        >
          {t.allTypes}
        </button>
        {EMPLOYEE_TYPES.map((type) => (
          <button
            key={type}
            onClick={() => setTypeFilter(type)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all capitalize ${typeFilter === type ? "bg-brand-50 text-brand-600 border-brand-200" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}
          >
            {type}
          </button>
        ))}
      </div>

      {message && (
        <div className={`px-4 py-3 rounded-lg text-sm font-medium ${message.type === "success" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
          {message.text}
        </div>
      )}

      <Modal open={showForm} onClose={() => setShowForm(false)} title={editingId ? t.editTitle : t.createTitle} size="xl">
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">{t.fullName}</label>
              <input type="text" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} className="input-field" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">{t.type}</label>
              <Select
                value={form.employee_type}
                onChange={(value) => {
                  const isTeacher = value === "teacher";
                  setForm({
                    ...form,
                    employee_type: value,
                    default_percentage: isTeacher ? form.default_percentage : "",
                  });
                }}
                options={EMPLOYEE_TYPES.map((type) => ({ value: type, label: type }))}
                placeholder={locale === "ar" ? "اختر النوع" : "Select type..."}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">{t.phone}</label>
              <input type="text" value={form.phone_number} onChange={(e) => setForm({ ...form, phone_number: e.target.value })} className="input-field" />
            </div>
            {form.employee_type === "teacher" && (
              <>
                <div className="md:col-span-3">
                  <label className="block text-xs font-medium text-slate-700 mb-1">{t.compensationType}</label>
                  <div className="flex gap-3">
                    {(["salary", "percentage", "hybrid"] as const).map((type) => (
                      <label key={type} className={`flex items-center gap-2 px-4 py-2 rounded-lg border cursor-pointer transition-all text-sm ${form.compensation_type === type ? "bg-brand-50 text-brand-600 border-brand-200" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>
                        <input
                          type="radio" name="compensation_type" value={type}
                          checked={form.compensation_type === type}
                          onChange={() => {
                            setForm({ ...form, compensation_type: type, salary: type === "percentage" ? "0" : form.salary, default_percentage: type === "salary" ? "" : form.default_percentage });
                          }}
                          className="sr-only"
                        />
                        {type === "salary" ? t.monthlySalary : type === "percentage" ? t.percentage : t.hybrid}
                      </label>
                    ))}
                  </div>
                </div>
                {(form.compensation_type === "salary" || form.compensation_type === "hybrid") && (
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">{t.compensationSalary}</label>
                    <input type="number" value={form.salary} onChange={(e) => setForm({ ...form, salary: e.target.value })} className="input-field" />
                  </div>
                )}
                {(form.compensation_type === "percentage" || form.compensation_type === "hybrid") && (
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">{t.defaultPct}</label>
                    <input type="number" value={form.default_percentage} onChange={(e) => setForm({ ...form, default_percentage: e.target.value })} className="input-field" min={0} max={100} />
                  </div>
                )}
              </>
            )}
            {form.employee_type !== "" && form.employee_type !== "teacher" && (
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">{t.monthlySalary}</label>
                <input type="number" value={form.salary} onChange={(e) => setForm({ ...form, salary: e.target.value })} className="input-field" />
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">{t.hireDate}</label>
              <input type="date" value={form.hire_date} onChange={(e) => setForm({ ...form, hire_date: e.target.value })} className="input-field" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">{t.contractEnd}</label>
              <input type="date" value={form.contract_end_date} onChange={(e) => setForm({ ...form, contract_end_date: e.target.value })} className="input-field" />
            </div>
            <div className="md:col-span-3">
              <label className="block text-xs font-medium text-slate-700 mb-1">{t.address}</label>
              <input type="text" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="input-field" />
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={handleSave} className="btn-primary">{t.save}</button>
            <button onClick={() => setShowForm(false)} className="btn-secondary">{t.cancel}</button>
          </div>
        </div>
      </Modal>

      {filteredEmployees.length === 0 ? (
        <div className="card p-8 text-center text-sm text-slate-500">{t.empty}</div>
      ) : (
        <div className="card overflow-hidden">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t.fullName}</th>
                <th>{t.type}</th>
                <th>{t.phone}</th>
                <th>{t.compensationType}</th>
                <th>{t.access}</th>
                <th>{t.status}</th>
                {(canEdit) && <th>{t.actions}</th>}
              </tr>
            </thead>
            <tbody>
              {filteredEmployees.map((emp) => (
                <tr key={emp.id} className={!emp.is_active ? "opacity-60" : ""}>
                  <td>
                    <button
                      onClick={() => router.push(`/${locale}/dashboard/employees/${emp.id}`)}
                      className="font-medium text-brand-600 hover:text-brand-700 hover:underline text-start flex items-center gap-2"
                    >
                      <Users size={14} className="text-slate-400" />
                      {emp.full_name}
                    </button>
                  </td>
                  <td>
                    <span className={`badge ${TYPE_COLORS[emp.employee_type] || "bg-slate-50 text-slate-600 border-slate-200"} capitalize`}>
                      {emp.employee_type}
                    </span>
                  </td>
                  <td className="text-slate-600 text-sm">{emp.phone_number || "—"}</td>
                  <td>
                    {emp.employee_type === "teacher" ? (
                      <>
                        {emp.default_salary !== null && (
                          <span className="badge bg-blue-50 text-blue-600 border-blue-100">{t.compensationSalary}: {emp.default_salary.toFixed(2)}</span>
                        )}
                        {emp.default_percentage !== null && (
                          <span className="badge bg-emerald-50 text-emerald-600 border-emerald-100">{t.defaultPct}: {emp.default_percentage}%</span>
                        )}
                        {emp.default_salary === null && emp.default_percentage === null && (
                          <span className="text-slate-400 text-sm">&mdash;</span>
                        )}
                      </>
                    ) : (
                      <>
                        {emp.default_salary !== null ? (
                          <span className="badge bg-blue-50 text-blue-600 border-blue-100">{t.monthlySalary}: {emp.default_salary.toFixed(2)}</span>
                        ) : (
                          <span className="text-slate-400 text-sm">&mdash;</span>
                        )}
                      </>
                    )}
                  </td>
                  <td>
                    {emp.has_user_account ? (
                      <span className="badge bg-emerald-50 text-emerald-600 border-emerald-100 flex items-center gap-1 w-fit">
                        <UserCheck size={12} /> {t.hasAccess}
                      </span>
                    ) : (
                      <span className="badge bg-slate-50 text-slate-400 border-slate-200 flex items-center gap-1 w-fit">
                        <UserX size={12} /> {t.noAccess}
                      </span>
                    )}
                  </td>
                  <td>
                    <span className={`badge ${emp.is_active ? "badge-success" : "bg-red-50 text-red-600 border border-red-100"}`}>
                      {emp.is_active ? t.active : t.deactivated}
                    </span>
                  </td>
                  {canEdit && (
                    <td>
                      <div className="flex items-center gap-2">
                        <button onClick={() => router.push(`/${locale}/dashboard/employees/${emp.id}`)} className="btn-icon" title="View">
                          <Eye size={15} />
                        </button>
                        <button onClick={() => openEdit(emp)} className="btn-icon" title={t.edit}>
                          <Pencil size={15} />
                        </button>
                        {emp.has_user_account ? (
                          <button onClick={() => setRevokeTarget(emp)} className="btn-icon text-orange-500" title={t.revokeAccess}>
                            <UserX size={15} />
                          </button>
                        ) : (
                          <button onClick={() => {
                            setGrantTarget(emp);
                            setGrantForm({ email: "", password: "", role_id: roles.find(r => r.name === "teacher")?.id || "" });
                          }} className="btn-icon text-emerald-500" title={t.grantAccess}>
                            <UserCheck size={15} />
                          </button>
                        )}
                        {emp.is_active && (
                          <button onClick={() => setDeleteTarget(emp)} className="btn-icon text-red-500" title={t.deactivate}>
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmModal open={deleteTarget !== null} title={t.confirmTitle}
        message={deleteTarget ? `${t.confirmDelete} (${deleteTarget.full_name})` : ""}
        confirmLabel={t.yes} cancelLabel={t.no} isRtl={isRtl}
        onConfirm={() => deleteTarget && handleDelete(deleteTarget.id)}
        onCancel={() => setDeleteTarget(null)} />

      <Modal open={grantTarget !== null} onClose={() => { setGrantTarget(null); setGrantError(null); }} title={t.grantTitle} size="xl">
        <div className="space-y-6">
          <p className="text-xs text-slate-500">{grantTarget?.full_name}</p>
          {grantError && (
            <div className="px-4 py-3 rounded-lg text-sm font-medium bg-red-50 text-red-700 border border-red-200">
              {grantError}
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">{t.email}</label>
            <input type="email" value={grantForm.email} onChange={(e) => setGrantForm({ ...grantForm, email: e.target.value })} className="input-field" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">{t.password}</label>
            <input type="password" value={grantForm.password} onChange={(e) => setGrantForm({ ...grantForm, password: e.target.value })} className="input-field" />
            <p className="text-xs text-slate-400 mt-1">{t.passwordHint}</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">{t.role}</label>
            <Select
              value={grantForm.role_id}
              onChange={(value) => setGrantForm({ ...grantForm, role_id: value })}
              options={roles.filter(r => r.name !== "superadmin").map(r => ({ value: r.id, label: r.name }))}
            />
          </div>
          <div className="flex gap-3 pt-1">
            <button onClick={handleGrantAccess} className="btn-primary">{t.save}</button>
            <button onClick={() => { setGrantTarget(null); setGrantError(null); }} className="btn-secondary">{t.cancel}</button>
          </div>
        </div>
      </Modal>

      <ConfirmModal open={revokeTarget !== null} title={t.revokeAccess}
        message={revokeTarget ? `${t.revokeConfirm} (${revokeTarget.full_name})` : ""}
        confirmLabel={t.yes} cancelLabel={t.no} isRtl={isRtl}
        onConfirm={handleRevokeAccess}
        onCancel={() => setRevokeTarget(null)} />
    </div>
  );
}
