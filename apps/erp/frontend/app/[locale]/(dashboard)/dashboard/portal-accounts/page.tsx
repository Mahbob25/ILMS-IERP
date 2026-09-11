"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useParams } from "next/navigation";
import { apiClient } from "@/lib/api";
import { useAuth } from "@/components/AuthContext";
import RefreshButton from "@/components/RefreshButton";
import ConfirmModal from "@/components/ConfirmModal";
import Modal from "@/components/Modal";
import Select from "@/components/ui/Select";
import TableContainer from "@/components/ui/TableContainer";
import {
  Loader2, Search, AlertCircle, KeyRound, UserCheck, UserX, Unlock,
  Link2, Trash2, LogIn, Copy, Check, GraduationCap, Users, ShieldCheck,
} from "lucide-react";
import { sanitizeInput } from "@/lib/utils/input";

interface PortalAccount {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  locale_pref: string;
  is_active: boolean;
  failed_login_attempts: number;
  locked_until: string | null;
  created_at: string | null;
  account_type: "student" | "parent";
  student_id: string | null;
  student_code: string | null;
  student_name: string | null;
  linked_students_count: number;
}

interface LinkedStudent {
  student_id: string;
  student_code: string | null;
  full_name: string;
  relationship: string | null;
  verified_at: string | null;
}

interface PortalAccountDetail extends PortalAccount {
  linked_students: LinkedStudent[];
}

interface StudentOption {
  id: string;
  student_code: string;
  full_name: string;
}

type ToggleAction = "deactivate" | "activate" | "unlock";

const PAGE_SIZE = 20;

function isLocked(account: PortalAccount): boolean {
  return !!account.locked_until && new Date(account.locked_until).getTime() > Date.now();
}

function statusOf(account: PortalAccount): "active" | "inactive" | "locked" {
  if (!account.is_active) return "inactive";
  if (isLocked(account)) return "locked";
  return "active";
}

export default function PortalAccountsPage() {
  const params = useParams();
  const { user: authUser } = useAuth();
  const locale = (params?.locale as string) || "ar";
  const isRtl = locale === "ar";

  const t = {
    ar: {
      title: "حسابات البوابة",
      subtitle: "إدارة حسابات الطلاب وأولياء الأمور في بوابة الطالب",
      search: "بحث بالاسم أو البريد أو الهاتف...",
      all: "الكل",
      students: "الطلاب",
      parents: "أولياء الأمور",
      active: "نشط",
      inactive: "غير نشط",
      locked: "مقفل",
      colName: "الاسم",
      colEmail: "البريد الإلكتروني",
      colPhone: "الهاتف",
      colType: "النوع",
      colLinked: "الطلاب المرتبطون",
      colStatus: "الحالة",
      colActions: "الإجراءات",
      empty: "لا توجد حسابات بوابة",
      loading: "جاري التحميل...",
      actionFailed: "فشل العملية",
      resetPassword: "إعادة تعيين كلمة المرور",
      resetTitle: "إعادة تعيين كلمة المرور",
      resetToPhone: "إعادة التعيين إلى رقم الهاتف",
      noPhone: "لا يوجد رقم هاتف لهذا الحساب",
      setCustom: "تعيين كلمة مرور مخصصة",
      newPassword: "كلمة المرور الجديدة",
      passwordHint: "8 أحرف على الأقل مع حرف كبير وصغير ورقم وحرف خاص",
      resetSuccess: "تم إعادة تعيين كلمة المرور",
      credentialsFor: "بيانات الدخول الجديدة",
      copy: "نسخ",
      copied: "تم النسخ",
      deactivate: "تعطيل",
      activate: "تفعيل",
      unlock: "إلغاء القفل",
      confirmDeactivateTitle: "تأكيد التعطيل",
      confirmDeactivate: "هل أنت متأكد من تعطيل هذا الحساب؟ سيتم إنهاء جلساته الحالية.",
      confirmActivateTitle: "تأكيد التفعيل",
      confirmActivate: "هل أنت متأكد من تفعيل هذا الحساب؟",
      confirmUnlockTitle: "تأكيد إلغاء القفل",
      confirmUnlock: "هل أنت متأكد من إلغاء قفل هذا الحساب؟",
      deactivated: "تم تعطيل الحساب",
      activated: "تم تفعيل الحساب",
      unlocked: "تم إلغاء قفل الحساب",
      manageLinks: "إدارة الطلاب المرتبطين",
      linksTitle: "الطلاب المرتبطون",
      linkedStudents: "الطلاب المرتبطون",
      addStudent: "إضافة طالب",
      selectStudent: "اختر طالباً...",
      relationship: "صلة القرابة",
      relationshipPlaceholder: "الأب، الأم...",
      link: "ربط",
      unlink: "إلغاء الربط",
      noLinks: "لا يوجد طلاب مرتبطون بعد",
      signInAs: "الدخول كـ",
      impersonating: "جاري فتح البوابة...",
      yes: "نعم",
      no: "لا",
      close: "إغلاق",
      prev: "السابق",
      next: "التالي",
      student: "طالب",
      parent: "ولي أمر",
      total: "الإجمالي",
    },
    en: {
      title: "Portal Accounts",
      subtitle: "Manage student and parent accounts in the student portal",
      search: "Search by name, email or phone...",
      all: "All",
      students: "Students",
      parents: "Parents",
      active: "Active",
      inactive: "Inactive",
      locked: "Locked",
      colName: "Name",
      colEmail: "Email",
      colPhone: "Phone",
      colType: "Type",
      colLinked: "Linked students",
      colStatus: "Status",
      colActions: "Actions",
      empty: "No portal accounts found",
      loading: "Loading...",
      actionFailed: "Action failed",
      resetPassword: "Reset Password",
      resetTitle: "Reset Password",
      resetToPhone: "Reset to the phone number",
      noPhone: "This account has no phone number",
      setCustom: "Set a custom password",
      newPassword: "New password",
      passwordHint: "At least 8 characters with uppercase, lowercase, digit and special character",
      resetSuccess: "Password reset",
      credentialsFor: "New sign-in credentials",
      copy: "Copy",
      copied: "Copied",
      deactivate: "Deactivate",
      activate: "Activate",
      unlock: "Unlock",
      confirmDeactivateTitle: "Confirm Deactivation",
      confirmDeactivate: "Deactivate this account? Its active sessions will be ended.",
      confirmActivateTitle: "Confirm Activation",
      confirmActivate: "Activate this account?",
      confirmUnlockTitle: "Confirm Unlock",
      confirmUnlock: "Unlock this account?",
      deactivated: "Account deactivated",
      activated: "Account activated",
      unlocked: "Account unlocked",
      manageLinks: "Manage linked students",
      linksTitle: "Linked Students",
      linkedStudents: "Linked students",
      addStudent: "Add student",
      selectStudent: "Select a student...",
      relationship: "Relationship",
      relationshipPlaceholder: "Father, mother...",
      link: "Link",
      unlink: "Unlink",
      noLinks: "No linked students yet",
      signInAs: "Sign in as",
      impersonating: "Opening portal...",
      yes: "Yes",
      no: "No",
      close: "Close",
      prev: "Previous",
      next: "Next",
      student: "Student",
      parent: "Parent",
      total: "Total",
    },
  }[locale === "en" ? "en" : "ar"];

  const [accounts, setAccounts] = useState<PortalAccount[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "student" | "parent">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive" | "locked">("all");
  const [skip, setSkip] = useState(0);

  const [resetTarget, setResetTarget] = useState<PortalAccount | null>(null);
  const [resetMode, setResetMode] = useState<"phone" | "custom">("phone");
  const [customPassword, setCustomPassword] = useState("");
  const [resetSubmitting, setResetSubmitting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<{ email: string | null; phone: string | null; password: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const [toggleTarget, setToggleTarget] = useState<PortalAccount | null>(null);
  const [toggleAction, setToggleAction] = useState<ToggleAction>("deactivate");

  const [linksTarget, setLinksTarget] = useState<PortalAccountDetail | null>(null);
  const [linksLoading, setLinksLoading] = useState(false);
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [selectedStudent, setSelectedStudent] = useState("");
  const [relationship, setRelationship] = useState("");
  const [linksSubmitting, setLinksSubmitting] = useState(false);

  const [impersonatingId, setImpersonatingId] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setSkip(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(null), 6000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await apiClient.get<{ items: PortalAccount[]; total: number }>(
        "/portal-accounts",
        {
          params: {
            search: search || undefined,
            account_type: typeFilter,
            status: statusFilter,
            skip,
            limit: PAGE_SIZE,
            sort_by: "created_at",
            sort_order: "desc",
          },
        }
      );
      setAccounts(res.data.items);
      setTotal(res.data.total);
    } catch (e) {
      setFetchError(t.actionFailed);
    } finally {
      setLoading(false);
    }
  }, [search, typeFilter, statusFilter, skip, t.actionFailed]);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  const extractApiError = (e: any): string => {
    const detail = e?.response?.data?.detail;
    if (!detail) return t.actionFailed;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) {
      return detail.map((d: any) => d.msg || d.message).filter(Boolean).join("; ");
    }
    return String(detail);
  };

  const openReset = (account: PortalAccount) => {
    setResetTarget(account);
    setResetMode(account.phone ? "phone" : "custom");
    setCustomPassword("");
    setResetError(null);
  };

  const handleResetSubmit = async () => {
    if (!resetTarget) return;
    setResetSubmitting(true);
    setResetError(null);
    try {
      const res = await apiClient.post<{
        id: string;
        email: string | null;
        phone: string | null;
        new_password: string;
      }>(`/portal-accounts/${resetTarget.id}/reset-password`, {
        mode: resetMode,
        new_password: resetMode === "custom" ? customPassword : undefined,
      });
      setCredentials({
        email: res.data.email,
        phone: res.data.phone,
        password: res.data.new_password,
      });
      setResetTarget(null);
      setMessage({ type: "success", text: t.resetSuccess });
      fetchAccounts();
    } catch (e: any) {
      setResetError(extractApiError(e));
    } finally {
      setResetSubmitting(false);
    }
  };

  const handleToggle = async () => {
    if (!toggleTarget) return;
    const account = toggleTarget;
    setToggleTarget(null);
    try {
      if (toggleAction === "unlock") {
        await apiClient.post(`/portal-accounts/${account.id}/unlock`);
        setMessage({ type: "success", text: t.unlocked });
      } else {
        await apiClient.post(`/portal-accounts/${account.id}/${toggleAction}`);
        setMessage({
          type: "success",
          text: toggleAction === "deactivate" ? t.deactivated : t.activated,
        });
      }
      fetchAccounts();
    } catch (e: any) {
      setMessage({ type: "error", text: extractApiError(e) });
    }
  };

  const openLinks = async (account: PortalAccount) => {
    setLinksLoading(true);
    setLinksTarget({ ...account, linked_students: [] });
    setSelectedStudent("");
    setRelationship("");
    try {
      const [detailRes, studentsRes] = await Promise.all([
        apiClient.get<PortalAccountDetail>(`/portal-accounts/${account.id}`),
        apiClient.get<{ items: StudentOption[] }>("/academic/students", {
          params: { limit: 200, sort_by: "full_name", sort_order: "asc" },
        }),
      ]);
      setLinksTarget(detailRes.data);
      setStudents(studentsRes.data.items);
    } catch (e: any) {
      setMessage({ type: "error", text: extractApiError(e) });
      setLinksTarget(null);
    } finally {
      setLinksLoading(false);
    }
  };

  const handleLink = async () => {
    if (!linksTarget || !selectedStudent) return;
    setLinksSubmitting(true);
    try {
      const res = await apiClient.post<PortalAccountDetail>(
        `/portal-accounts/${linksTarget.id}/links`,
        { student_id: selectedStudent, relationship: relationship ? sanitizeInput(relationship) : null }
      );
      setLinksTarget(res.data);
      setSelectedStudent("");
      setRelationship("");
      fetchAccounts();
    } catch (e: any) {
      setMessage({ type: "error", text: extractApiError(e) });
    } finally {
      setLinksSubmitting(false);
    }
  };

  const handleUnlink = async (studentId: string) => {
    if (!linksTarget) return;
    setLinksSubmitting(true);
    try {
      const res = await apiClient.delete<PortalAccountDetail>(
        `/portal-accounts/${linksTarget.id}/links/${studentId}`
      );
      setLinksTarget(res.data);
      fetchAccounts();
    } catch (e: any) {
      setMessage({ type: "error", text: extractApiError(e) });
    } finally {
      setLinksSubmitting(false);
    }
  };

  const handleImpersonate = async (account: PortalAccount) => {
    setImpersonatingId(account.id);
    try {
      const res = await apiClient.post<{ url: string }>(
        `/portal-accounts/${account.id}/impersonate`,
        {},
        { params: { locale } }
      );
      window.open(res.data.url, "_blank", "noopener");
    } catch (e: any) {
      setMessage({ type: "error", text: extractApiError(e) });
    } finally {
      setImpersonatingId(null);
    }
  };

  const copyCredentials = async () => {
    if (!credentials) return;
    const text = `${credentials.email ?? credentials.phone ?? ""}\n${credentials.password}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable — the value is visible for manual copy.
    }
  };

  const linkedIds = useMemo(
    () => new Set((linksTarget?.linked_students ?? []).map((s) => s.student_id)),
    [linksTarget]
  );

  const studentOptions = useMemo(
    () =>
      students
        .filter((s) => !linkedIds.has(s.id))
        .map((s) => ({ value: s.id, label: `${s.full_name} · ${s.student_code}` })),
    [students, linkedIds]
  );

  const confirmTitle = (): string => {
    if (toggleAction === "deactivate") return t.confirmDeactivateTitle;
    if (toggleAction === "unlock") return t.confirmUnlockTitle;
    return t.confirmActivateTitle;
  };

  const confirmMessage = (): string => {
    if (!toggleTarget) return "";
    const base =
      toggleAction === "deactivate"
        ? t.confirmDeactivate
        : toggleAction === "unlock"
          ? t.confirmUnlock
          : t.confirmActivate;
    return `${base} (${toggleTarget.full_name})`;
  };

  const statusBadge = (account: PortalAccount) => {
    const status = statusOf(account);
    if (status === "locked") {
      return (
        <span className="badge bg-amber-50 text-amber-600 border border-amber-100">{t.locked}</span>
      );
    }
    if (status === "inactive") {
      return (
        <span className="badge bg-red-50 text-red-600 border border-red-100">{t.inactive}</span>
      );
    }
    return <span className="badge badge-success">{t.active}</span>;
  };

  const typeBadge = (account: PortalAccount) =>
    account.account_type === "parent" ? (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border bg-blue-50 text-blue-600 border-blue-100">
        <Users size={13} />
        {t.parent}
      </span>
    ) : (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border bg-emerald-50 text-emerald-600 border-emerald-100">
        <GraduationCap size={13} />
        {t.student}
      </span>
    );

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
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={t.search}
              className="input-field ps-9 pe-3 w-64"
            />
          </div>
          <RefreshButton onRefresh={fetchAccounts} />
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {(["all", "student", "parent"] as const).map((value) => (
          <button
            key={value}
            onClick={() => {
              setTypeFilter(value);
              setSkip(0);
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
              typeFilter === value
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
            }`}
          >
            {value === "all" ? t.all : value === "student" ? t.students : t.parents}
          </button>
        ))}
        <span className="mx-1 h-5 w-px bg-slate-200" />
        {(["all", "active", "inactive", "locked"] as const).map((value) => (
          <button
            key={value}
            onClick={() => {
              setStatusFilter(value);
              setSkip(0);
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
              statusFilter === value
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
            }`}
          >
            {value === "all" ? t.all : value === "active" ? t.active : value === "inactive" ? t.inactive : t.locked}
          </button>
        ))}
      </div>

      {message && (
        <div
          className={`px-4 py-3 rounded-lg text-sm font-medium ${
            message.type === "success"
              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
              : "bg-red-50 text-red-700 border border-red-200"
          }`}
        >
          {message.text}
        </div>
      )}

      {fetchError && (
        <div className="px-4 py-3 rounded-lg text-sm font-medium bg-red-50 text-red-700 border border-red-200 flex items-center gap-2">
          <AlertCircle size={16} />
          {fetchError}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="animate-spin text-slate-400" size={24} />
        </div>
      ) : accounts.length === 0 ? (
        <div className="card p-8 text-center text-sm text-slate-500">{t.empty}</div>
      ) : (
        <div className="card overflow-hidden">
          <TableContainer>
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t.colName}</th>
                  <th>{t.colEmail}</th>
                  <th>{t.colPhone}</th>
                  <th>{t.colType}</th>
                  <th>{t.colLinked}</th>
                  <th>{t.colStatus}</th>
                  <th>{t.colActions}</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((account) => (
                  <tr key={account.id} className={!account.is_active ? "opacity-60" : ""}>
                    <td className="font-medium text-slate-900">{account.full_name}</td>
                    <td className="text-slate-600">{account.email || "—"}</td>
                    <td className="text-slate-600">{account.phone || "—"}</td>
                    <td>{typeBadge(account)}</td>
                    <td className="text-slate-600">
                      {account.account_type === "parent" ? account.linked_students_count : "—"}
                    </td>
                    <td>{statusBadge(account)}</td>
                    <td>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => openReset(account)}
                          className="btn-icon"
                          title={t.resetPassword}
                        >
                          <KeyRound size={15} />
                        </button>
                        {account.account_type === "parent" && (
                          <button
                            onClick={() => openLinks(account)}
                            className="btn-icon"
                            title={t.manageLinks}
                          >
                            <Link2 size={15} />
                          </button>
                        )}
                        {statusOf(account) === "locked" && (
                          <button
                            onClick={() => {
                              setToggleTarget(account);
                              setToggleAction("unlock");
                            }}
                            className="btn-icon text-amber-500"
                            title={t.unlock}
                          >
                            <Unlock size={15} />
                          </button>
                        )}
                        {account.is_active ? (
                          <button
                            onClick={() => {
                              setToggleTarget(account);
                              setToggleAction("deactivate");
                            }}
                            className="btn-icon text-red-500"
                            title={t.deactivate}
                          >
                            <UserX size={15} />
                          </button>
                        ) : (
                          <button
                            onClick={() => {
                              setToggleTarget(account);
                              setToggleAction("activate");
                            }}
                            className="btn-icon text-emerald-500"
                            title={t.activate}
                          >
                            <UserCheck size={15} />
                          </button>
                        )}
                        {authUser?.is_superadmin && account.is_active && (
                          <button
                            onClick={() => handleImpersonate(account)}
                            disabled={impersonatingId === account.id}
                            className="btn-icon text-brand-600"
                            title={t.signInAs}
                          >
                            {impersonatingId === account.id ? (
                              <Loader2 size={15} className="animate-spin" />
                            ) : (
                              <LogIn size={15} />
                            )}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableContainer>
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 text-xs text-slate-500">
            <span>
              {t.total}: {total}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSkip((s) => Math.max(0, s - PAGE_SIZE))}
                disabled={skip === 0}
                className="btn-secondary disabled:opacity-40"
              >
                {t.prev}
              </button>
              <button
                onClick={() => setSkip((s) => s + PAGE_SIZE)}
                disabled={skip + PAGE_SIZE >= total}
                className="btn-secondary disabled:opacity-40"
              >
                {t.next}
              </button>
            </div>
          </div>
        </div>
      )}

      <Modal
        open={resetTarget !== null}
        onClose={() => setResetTarget(null)}
        title={t.resetTitle}
        size="md"
        isRtl={isRtl}
      >
        <div className="space-y-5">
          {resetTarget && (
            <p className="text-sm text-slate-600">
              {resetTarget.full_name}
              {resetTarget.email ? ` · ${resetTarget.email}` : ""}
            </p>
          )}
          {resetError && (
            <div className="px-4 py-3 rounded-lg text-sm font-medium bg-red-50 text-red-700 border border-red-200">
              {resetError}
            </div>
          )}
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="radio"
              name="reset-mode"
              checked={resetMode === "phone"}
              disabled={!resetTarget?.phone}
              onChange={() => setResetMode("phone")}
              className="mt-0.5"
            />
            <span className="text-sm text-slate-700">
              {t.resetToPhone}
              <span className="block text-xs text-slate-400">
                {resetTarget?.phone || t.noPhone}
              </span>
            </span>
          </label>
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="radio"
              name="reset-mode"
              checked={resetMode === "custom"}
              onChange={() => setResetMode("custom")}
              className="mt-0.5"
            />
            <span className="text-sm text-slate-700 w-full">
              {t.setCustom}
              {resetMode === "custom" && (
                <span className="block mt-2">
                  <input
                    type="password"
                    value={customPassword}
                    onChange={(e) => setCustomPassword(e.target.value)}
                    placeholder={t.newPassword}
                    className="input-field"
                    autoComplete="new-password"
                  />
                  <span className="block mt-1 text-[11px] text-slate-400">{t.passwordHint}</span>
                </span>
              )}
            </span>
          </label>
          <div className="flex gap-3 pt-2">
            <button
              onClick={handleResetSubmit}
              disabled={resetSubmitting || (resetMode === "custom" && customPassword.length < 8)}
              className="btn-primary flex items-center gap-2 disabled:opacity-50"
            >
              {resetSubmitting && <Loader2 size={16} className="animate-spin" />}
              {t.resetPassword}
            </button>
            <button onClick={() => setResetTarget(null)} className="btn-secondary">
              {t.no}
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        open={credentials !== null}
        onClose={() => setCredentials(null)}
        title={t.credentialsFor}
        size="md"
        isRtl={isRtl}
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2 text-sm">
            <div className="flex items-center justify-between gap-4">
              <span className="text-slate-500">{t.colEmail}</span>
              <span className="font-medium text-slate-900 break-all">
                {credentials?.email || credentials?.phone || "—"}
              </span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-slate-500">{t.newPassword}</span>
              <span className="font-mono font-medium text-slate-900">{credentials?.password}</span>
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={copyCredentials} className="btn-primary flex items-center gap-2">
              {copied ? <Check size={16} /> : <Copy size={16} />}
              {copied ? t.copied : t.copy}
            </button>
            <button onClick={() => setCredentials(null)} className="btn-secondary">
              {t.close}
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        open={linksTarget !== null}
        onClose={() => setLinksTarget(null)}
        title={t.linksTitle}
        size="lg"
        isRtl={isRtl}
      >
        <div className="space-y-5">
          {linksTarget && (
            <p className="text-sm text-slate-600 flex items-center gap-2">
              <Users size={15} />
              {linksTarget.full_name}
              {linksTarget.email ? ` · ${linksTarget.email}` : ""}
            </p>
          )}
          {linksLoading ? (
            <div className="flex items-center justify-center h-24">
              <Loader2 className="animate-spin text-slate-400" size={22} />
            </div>
          ) : (
            <>
              <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 overflow-hidden">
                {(linksTarget?.linked_students ?? []).length === 0 ? (
                  <p className="px-4 py-4 text-sm text-slate-400">{t.noLinks}</p>
                ) : (
                  linksTarget?.linked_students.map((student) => (
                    <div key={student.student_id} className="flex items-center justify-between gap-3 px-4 py-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-900 truncate">
                          {student.full_name}
                        </p>
                        <p className="text-xs text-slate-500">
                          {student.student_code}
                          {student.relationship ? ` · ${student.relationship}` : ""}
                        </p>
                      </div>
                      <button
                        onClick={() => handleUnlink(student.student_id)}
                        disabled={linksSubmitting}
                        className="btn-icon text-red-500"
                        title={t.unlink}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))
                )}
              </div>

              <div className="space-y-3 rounded-xl border border-slate-200 p-4">
                <p className="text-sm font-semibold text-slate-900">{t.addStudent}</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Select
                    value={selectedStudent}
                    onChange={setSelectedStudent}
                    options={studentOptions}
                    placeholder={t.selectStudent}
                    searchable
                    isRtl={isRtl}
                  />
                  <input
                    type="text"
                    value={relationship}
                    onChange={(e) => setRelationship(e.target.value)}
                    placeholder={`${t.relationship} — ${t.relationshipPlaceholder}`}
                    className="input-field"
                  />
                </div>
                <button
                  onClick={handleLink}
                  disabled={!selectedStudent || linksSubmitting}
                  className="btn-primary flex items-center gap-2 disabled:opacity-50"
                >
                  {linksSubmitting && <Loader2 size={16} className="animate-spin" />}
                  <Link2 size={16} />
                  {t.link}
                </button>
              </div>
            </>
          )}
          <div className="flex justify-end">
            <button onClick={() => setLinksTarget(null)} className="btn-secondary">
              {t.close}
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmModal
        open={toggleTarget !== null}
        title={confirmTitle()}
        message={confirmMessage()}
        confirmLabel={t.yes}
        cancelLabel={t.no}
        isRtl={isRtl}
        onConfirm={handleToggle}
        onCancel={() => setToggleTarget(null)}
      />
    </div>
  );
}
