"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { apiClient } from "@/lib/api";
import { useAuth } from "@/components/AuthContext";
import Modal from "@/components/Modal";
import { Loader2, RefreshCw, Wallet, AlertCircle } from "lucide-react";

interface StaffMember {
  id: string;
  full_name: string;
  role: string;
  monthly_salary: number;
  total_drawn_this_month: number;
  remaining_balance: number;
}

export default function StaffPayrollPage() {
  const params = useParams();
  const { user } = useAuth();
  const locale = (params?.locale as string) || "ar";
  const isRtl = locale === "ar";

  const t = {
    ar: {
      title: "الرواتب",
      subtitle: "إدارة سحوبات الرواتب للموظفين",
      name: "الاسم",
      role: "الوظيفة",
      monthlySalary: "الراتب الشهري",
      totalDrawn: "المسحوب هذا الشهر",
      remaining: "المتبقي",
      action: "إجراء",
      processWithdrawal: "صرف راتب",
      enterAmount: "أدخل المبلغ",
      description: "ملاحظات (اختياري)",
      save: "صرف",
      cancel: "إلغاء",
      loading: "جاري التحميل...",
      refresh: "تحديث",
      insufficient: "رصيد غير كافٍ",
      success: "تم الصرف بنجاح",
      error: "حدث خطأ",
      sar: "ريال",
      empty: "لا يوجد موظفون متاحون",
      manager: "مدير",
      secretary: "سكرتير",
      cleaner: "عامل نظافة",
      security: "حارس أمن",
      receptionist: "موظف استقبال",
      accountant: "محاسب",
      maintenance: "صيانة",
      other: "أخرى",
    },
    en: {
      title: "Staff Payroll",
      subtitle: "Manage salary withdrawals for staff",
      name: "Name",
      role: "Role",
      monthlySalary: "Monthly Salary",
      totalDrawn: "Drawn This Month",
      remaining: "Remaining",
      action: "Action",
      processWithdrawal: "Process Withdrawal",
      enterAmount: "Enter Amount",
      description: "Notes (optional)",
      save: "Withdraw",
      cancel: "Cancel",
      loading: "Loading...",
      refresh: "Refresh",
      insufficient: "Insufficient balance",
      success: "Withdrawal processed",
      error: "An error occurred",
      sar: "YER",
      empty: "No staff members available",
      manager: "Manager",
      secretary: "Secretary",
      cleaner: "Cleaner",
      security: "Security",
      receptionist: "Receptionist",
      accountant: "Accountant",
      maintenance: "Maintenance",
      other: "Other",
    },
  }[locale === "en" ? "en" : "ar"];

  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMember, setSelectedMember] = useState<StaffMember | null>(null);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [fetchError, setFetchError] = useState("");

  const fetchStaff = useCallback(async () => {
    setLoading(true);
    setFetchError("");
    try {
      const { data } = await apiClient.get<StaffMember[]>("/staff-payroll");
      setStaff(data);
    } catch {
      setFetchError(t.error);
    }
    setLoading(false);
  }, [t.error]);

  useEffect(() => {
    fetchStaff();
  }, [fetchStaff]);

  useEffect(() => {
    if (successMsg) {
      const timer = setTimeout(() => setSuccessMsg(""), 6000);
      return () => clearTimeout(timer);
    }
  }, [successMsg]);

  const openWithdrawModal = (member: StaffMember) => {
    setSelectedMember(member);
    setWithdrawAmount("");
    setDescription("");
    setError("");
    setSuccessMsg("");
  };

  const handleWithdraw = async () => {
    if (!selectedMember) return;

    const amount = parseFloat(withdrawAmount);
    if (isNaN(amount) || amount <= 0) return;
    if (amount > selectedMember.remaining_balance) {
      setError(t.insufficient);
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      await apiClient.post(
        `/staff-payroll/${selectedMember.id}/withdraw`,
        {
          amount,
          description: description || undefined,
        }
      );

      await fetchStaff();

      setSuccessMsg(t.success);
      setTimeout(() => {
        setSelectedMember(null);
        setSuccessMsg("");
      }, 1200);
    } catch (e: any) {
      const detail =
        e?.response?.data?.detail || t.error;
      setError(detail);
    } finally {
      setSubmitting(false);
    }
  };

  const roleLabel = (role: string) => {
    const labels: Record<string, string> = {
      manager: t.manager,
      secretary: t.secretary,
      cleaner: t.cleaner,
      security: t.security,
      receptionist: t.receptionist,
      accountant: t.accountant,
      maintenance: t.maintenance,
    };
    return labels[role] || t.other;
  };

  const roleBadge = (role: string) => {
    const colorMap: Record<string, string> = {
      manager: "bg-blue-50 text-blue-600 border-blue-200",
      secretary: "bg-purple-50 text-purple-600 border-purple-200",
      cleaner: "bg-slate-100 text-slate-600 border-slate-200",
      security: "bg-amber-50 text-amber-600 border-amber-200",
      receptionist: "bg-cyan-50 text-cyan-600 border-cyan-200",
      accountant: "bg-emerald-50 text-emerald-600 border-emerald-200",
      maintenance: "bg-orange-50 text-orange-600 border-orange-200",
    };
    return (
      <span
        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${
          colorMap[role] || "bg-gray-100 text-gray-600 border-gray-200"
        }`}
      >
        {roleLabel(role)}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="animate-spin text-slate-400" size={24} />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto animate-fade-in" dir={isRtl ? "rtl" : "ltr"}>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">{t.title}</h2>
          <p className="text-sm text-slate-500 mt-1">{t.subtitle}</p>
        </div>
        <button
          onClick={fetchStaff}
          className="btn-icon"
          title={t.refresh}
        >
          <RefreshCw size={16} />
        </button>
      </div>

      {fetchError && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-medium bg-red-50 text-red-700 border border-red-200">
          <AlertCircle size={16} />{fetchError}
        </div>
      )}

      {successMsg && (
        <div className="px-4 py-3 rounded-lg text-sm font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
          {successMsg}
        </div>
      )}

      <div className="card overflow-hidden">
        <table className="data-table">
          <thead>
            <tr>
              <th>{t.name}</th>
              <th>{t.role}</th>
              <th>{t.monthlySalary}</th>
              <th>{t.totalDrawn}</th>
              <th>{t.remaining}</th>
              <th>{t.action}</th>
            </tr>
          </thead>
          <tbody>
            {staff.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center text-sm text-slate-500 py-8">
                  {t.empty}
                </td>
              </tr>
            ) : (
              staff.map((member) => (
                <tr key={member.id}>
                  <td className="font-medium text-slate-900">{member.full_name}</td>
                  <td>{roleBadge(member.role)}</td>
                  <td className="font-semibold text-slate-900">
                    {member.monthly_salary.toFixed(2)} {t.sar}
                  </td>
                  <td className="text-slate-600">
                    {member.total_drawn_this_month.toFixed(2)} {t.sar}
                  </td>
                  <td>
                    <span
                      className={`font-semibold ${
                        member.remaining_balance <= 0
                          ? "text-red-600"
                          : "text-emerald-600"
                      }`}
                    >
                      {member.remaining_balance.toFixed(2)} {t.sar}
                    </span>
                  </td>
                  <td>
                    <button
                      onClick={() => openWithdrawModal(member)}
                      disabled={member.remaining_balance <= 0}
                      className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1"
                    >
                      <Wallet size={14} />
                      <span>{t.processWithdrawal}</span>
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Modal
        open={selectedMember !== null}
        onClose={() => {
          setSelectedMember(null);
          setError("");
        }}
        title={`${t.processWithdrawal} — ${selectedMember?.full_name || ""}`}
        size="md"
      >
        {selectedMember && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div className="bg-slate-50 p-3 rounded-lg text-center">
                <p className="text-slate-500 text-xs">{t.monthlySalary}</p>
                <p className="font-bold text-slate-900">
                  {selectedMember.monthly_salary.toFixed(2)} {t.sar}
                </p>
              </div>
              <div className="bg-slate-50 p-3 rounded-lg text-center">
                <p className="text-slate-500 text-xs">{t.totalDrawn}</p>
                <p className="font-bold text-slate-600">
                  {selectedMember.total_drawn_this_month.toFixed(2)} {t.sar}
                </p>
              </div>
              <div className="bg-slate-50 p-3 rounded-lg text-center">
                <p className="text-slate-500 text-xs">{t.remaining}</p>
                <p className="font-bold text-emerald-600">
                  {selectedMember.remaining_balance.toFixed(2)} {t.sar}
                </p>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {t.enterAmount}
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                max={selectedMember.remaining_balance}
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value)}
                className="input-field"
                placeholder="0.00"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {t.description}
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="input-field"
                rows={2}
              />
            </div>

            {error && (
              <div className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">
                {error}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                onClick={handleWithdraw}
                disabled={submitting || !withdrawAmount || parseFloat(withdrawAmount) <= 0}
                className="btn-primary"
              >
                {submitting ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : null}
                {t.save}
              </button>
              <button
                onClick={() => {
                  setSelectedMember(null);
                  setError("");
                }}
                disabled={submitting}
                className="btn-secondary"
              >
                {t.cancel}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
