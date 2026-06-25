"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { apiClient } from "@/lib/api";
import { useAuth } from "@/components/AuthContext";
import { Plus, Loader2, RefreshCw, Eye, X, Receipt } from "lucide-react";

interface Expense {
  id: string;
  amount: number;
  description: string | null;
  recipient_name: string;
  date: string;
  receipt_number: string;
  type: string;
}

export default function ExpensesPage() {
  const params = useParams();
  const { user } = useAuth();
  const locale = (params?.locale as string) || "ar";
  const isRtl = locale === "ar";

  const t = {
    ar: {
      title: "المصروفات",
      subtitle: "إدارة المصروفات والسحوبات",
      receiptNumber: "رقم السند",
      recipient: "المستلم",
      amount: "المبلغ",
      date: "التاريخ",
      type: "النوع",
      description: "الوصف",
      actions: "الإجراءات",
      add: "تسجيل مصروف",
      save: "حفظ",
      cancel: "إلغاء",
      loading: "جاري التحميل...",
      empty: "لا توجد مصروفات بعد",
      refresh: "تحديث",
      selectType: "اختر النوع",
      enterAmount: "أدخل المبلغ",
      enterRecipient: "اسم المستلم",
      enterDescription: "وصف (اختياري)",
      voucherPreview: "معاينة السند",
      print: "طباعة",
      close: "إغلاق",
      voucherTitle: "سند صرف",
      instituteName: "معهد التعليم المتطور",
      signature: "التوقيع",
      cashier: "أمين الصندوق",
      recipientSignature: "توقيع المستلم",
      paid: "مدفوع",
      sar: "ريال",
      generalExpense: "مصروف عام",
      teacherWithdrawal: "سحب معلم",
      secretaryAdvance: "سلفة سكرتير",
      filterType: "تصفية حسب النوع",
      all: "الكل",
    },
    en: {
      title: "Expenses",
      subtitle: "Manage expenses and withdrawals",
      receiptNumber: "Voucher No.",
      recipient: "Recipient",
      amount: "Amount",
      date: "Date",
      type: "Type",
      description: "Description",
      actions: "Actions",
      add: "Record Expense",
      save: "Save",
      cancel: "Cancel",
      loading: "Loading...",
      empty: "No expenses yet",
      refresh: "Refresh",
      selectType: "Select Type",
      enterAmount: "Enter Amount",
      enterRecipient: "Recipient Name",
      enterDescription: "Description (optional)",
      voucherPreview: "Voucher Preview",
      print: "Print",
      close: "Close",
      voucherTitle: "Payment Voucher",
      instituteName: "Advanced Learning Institute",
      signature: "Signature",
      cashier: "Cashier",
      recipientSignature: "Recipient Signature",
      paid: "Paid",
      sar: "SAR",
      generalExpense: "General Expense",
      teacherWithdrawal: "Teacher Withdrawal",
      secretaryAdvance: "Secretary Advance",
      filterType: "Filter by Type",
      all: "All",
    },
  }[locale === "en" ? "en" : "ar"];

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [showVoucher, setShowVoucher] = useState<Expense | null>(null);
  const [filterType, setFilterType] = useState("");
  const [form, setForm] = useState({
    amount: "",
    recipient_name: "",
    description: "",
    type: "general_expense",
    date: new Date().toISOString().split("T")[0],
  });

  const canCreate = user?.is_superadmin || user?.role?.name === "manager" || user?.role?.name === "secretary";

  const fetchExpenses = useCallback(async () => {
    try {
      const params: Record<string, string> = {};
      if (filterType) params.type = filterType;
      const res = await apiClient.get<Expense[]>("/lms/expenses", { params });
      setExpenses(res.data);
    } catch (e) {
      console.error(e);
    }
  }, [filterType]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    await fetchExpenses();
    setLoading(false);
  }, [fetchExpenses]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchExpenses();
    setRefreshing(false);
  };

  const typeBadge = (type: string) => {
    const colors: Record<string, string> = {
      general_expense: "bg-slate-100 text-slate-600 border-slate-200",
      teacher_withdrawal: "bg-amber-50 text-amber-600 border-amber-200",
      secretary_advance: "bg-purple-50 text-purple-600 border-purple-200",
    };
    const labels: Record<string, string> = {
      general_expense: t.generalExpense,
      teacher_withdrawal: t.teacherWithdrawal,
      secretary_advance: t.secretaryAdvance,
    };
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${colors[type] || colors.general_expense}`}>
        {labels[type] || type}
      </span>
    );
  };

  const handleSave = async () => {
    if (!form.amount || !form.recipient_name) return;
    try {
      const payload: Record<string, unknown> = {
        amount: parseFloat(form.amount),
        recipient_name: form.recipient_name,
        type: form.type,
      };
      if (form.description) payload.description = form.description;
      if (form.date) payload.date = form.date;
      const res = await apiClient.post("/lms/expenses", payload);
      setShowForm(false);
      setShowVoucher(res.data);
      fetchExpenses();
    } catch (e) {
      console.error(e);
    }
  };

  const handlePrint = () => window.print();

  const formatDate = (d: string) => {
    try {
      return new Date(d + "T00:00:00").toLocaleDateString(locale === "ar" ? "ar-SA" : "en-US", {
        year: "numeric", month: "short", day: "numeric",
      });
    } catch { return d; }
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
        <div className="flex items-center gap-2">
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="input-field text-xs w-36"
          >
            <option value="">{t.all}</option>
            <option value="general_expense">{t.generalExpense}</option>
            <option value="teacher_withdrawal">{t.teacherWithdrawal}</option>
            <option value="secretary_advance">{t.secretaryAdvance}</option>
          </select>
          <button onClick={handleRefresh} disabled={refreshing} className="btn-icon" title={t.refresh}>
            <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
          </button>
          {canCreate && (
            <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-2">
              <Plus size={16} />
              <span>{t.add}</span>
            </button>
          )}
        </div>
      </div>

      {showForm && (
        <div className="card p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">{t.selectType}</label>
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="input-field">
                <option value="general_expense">{t.generalExpense}</option>
                <option value="teacher_withdrawal">{t.teacherWithdrawal}</option>
                <option value="secretary_advance">{t.secretaryAdvance}</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">{t.enterRecipient}</label>
              <input type="text" value={form.recipient_name} onChange={(e) => setForm({ ...form, recipient_name: e.target.value })} className="input-field" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">{t.enterAmount}</label>
              <input type="number" step="0.01" min="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="input-field" placeholder="0.00" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">{t.date}</label>
              <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="input-field" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">{t.enterDescription}</label>
              <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="input-field" rows={2} />
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={handleSave} className="btn-primary">{t.save}</button>
            <button onClick={() => setShowForm(false)} className="btn-secondary">{t.cancel}</button>
          </div>
        </div>
      )}

      {expenses.length === 0 ? (
        <div className="card p-8 text-center text-sm text-slate-500">{t.empty}</div>
      ) : (
        <div className="card overflow-hidden">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t.receiptNumber}</th>
                <th>{t.type}</th>
                <th>{t.recipient}</th>
                <th>{t.amount}</th>
                <th>{t.date}</th>
                <th>{t.actions}</th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((exp) => (
                <tr key={exp.id}>
                  <td><span className="badge badge-warning">{exp.receipt_number}</span></td>
                  <td>{typeBadge(exp.type)}</td>
                  <td className="font-medium text-slate-900">{exp.recipient_name}</td>
                  <td className="font-semibold text-slate-900">{exp.amount.toFixed(2)} {t.sar}</td>
                  <td className="text-slate-500">{formatDate(exp.date)}</td>
                  <td>
                    <button onClick={() => setShowVoucher(exp)} className="btn-icon" title={t.voucherPreview}>
                      <Eye size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showVoucher && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-slate-900">{t.voucherTitle}</h3>
                <button onClick={() => setShowVoucher(null)} className="btn-icon"><X size={18} /></button>
              </div>
              <div className="border-t border-slate-200 pt-4 space-y-3 text-sm">
                <div className="text-center pb-4 border-b border-slate-100">
                  <h4 className="text-base font-bold text-slate-900">{t.instituteName}</h4>
                  <p className="text-slate-500 mt-1">{t.voucherTitle}</p>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">{t.receiptNumber}</span>
                  <span className="font-semibold text-slate-900">{showVoucher.receipt_number}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">{t.type}</span>
                  <span>{typeBadge(showVoucher.type)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">{t.date}</span>
                  <span className="text-slate-900">{formatDate(showVoucher.date)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">{t.recipient}</span>
                  <span className="font-medium text-slate-900">{showVoucher.recipient_name}</span>
                </div>
                {showVoucher.description && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">{t.description}</span>
                    <span className="text-slate-900">{showVoucher.description}</span>
                  </div>
                )}
                <div className="flex justify-between pt-2 border-t border-slate-200 text-base">
                  <span className="font-bold text-slate-900">{t.paid}</span>
                  <span className="font-bold text-red-600">{showVoucher.amount.toFixed(2)} {t.sar}</span>
                </div>
              </div>
            </div>
            <div className="border-t border-slate-200 p-4 flex gap-3 justify-end">
              <button onClick={handlePrint} className="btn-primary flex items-center gap-2">
                <Receipt size={16} /><span>{t.print}</span>
              </button>
              <button onClick={() => setShowVoucher(null)} className="btn-secondary">{t.close}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
