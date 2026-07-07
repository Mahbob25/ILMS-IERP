"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { apiClient } from "@/lib/api";
import { useAuth } from "@/components/AuthContext";
import Modal from "@/components/Modal";
import Select from "@/components/ui/Select";
import { Plus, Loader2, RefreshCw, Eye, X } from "lucide-react";
import ReceiptModal, { ReceiptData } from "@/components/ReceiptModal";
import { getLocalDateString, formatDisplayDate } from "@/lib/dates";

interface Expense {
  id: string;
  amount: number;
  description: string | null;
  recipient_name: string;
  recipient_id: string | null;
  date: string;
  receipt_number: string;
  type: string;
  created_by: string | null;
  created_by_name: string;
}

interface EligibleRecipient {
  id: string;
  full_name: string;
  role: string;
  available_limit: number;
  is_eligible: boolean;
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
      instituteName: "Al-Drasat ERP",
      signature: "التوقيع",
      cashier: "أمين الصندوق",
      recipientSignature: "توقيع المستلم",
      paid: "مدفوع",
      createdBy: "تم بواسطة",
      sar: "ريال",
      generalExpense: "مصروف عام",
      teacherWithdrawal: "سحب معلم",
      secretaryAdvance: "سلفة سكرتير",
      filterType: "تصفية حسب النوع",
      all: "الكل",
      availableBalance: "الرصيد المتاح",
      remainingStipend: "المتبقي من الراتب",
      selectRecipient: "اختر المستلم",
      limitLabel: "الحد الأقصى",
      eligible: "مؤهل",
      notEligible: "غير مؤهل",
      ineligibleRecipientWarning: "لا يمكن السحب: الرصيد غير كافٍ",
      amountExceedsBalance: "المبلغ يتجاوز الرصيد المتاح",
      recipientNotEligible: "المستلم غير مؤهل للسحب",
      dateIsClosed: "التاريخ مقفل - لا يمكن إجراء عمليات على هذا التاريخ",
      expenseError: "حدث خطأ أثناء تسجيل المصروف",
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
      instituteName: "Al-Drasat ERP",
      signature: "Signature",
      cashier: "Cashier",
      recipientSignature: "Recipient Signature",
      paid: "Paid",
      createdBy: "Created By",
      sar: "YER",
      generalExpense: "General Expense",
      teacherWithdrawal: "Teacher Withdrawal",
      secretaryAdvance: "Secretary Advance",
      filterType: "Filter by Type",
      all: "All",
      availableBalance: "Available Balance",
      remainingStipend: "Remaining Stipend",
      selectRecipient: "Select Recipient",
      limitLabel: "Limit",
      eligible: "Eligible",
      notEligible: "Not Eligible",
      ineligibleRecipientWarning: "Cannot deduct: insufficient balance",
      amountExceedsBalance: "Amount exceeds available balance",
      recipientNotEligible: "Recipient is not eligible for withdrawal",
      dateIsClosed: "Date is closed - cannot perform operations on this date",
      expenseError: "Error creating expense",
    },
  }[locale === "en" ? "en" : "ar"];

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [showVoucher, setShowVoucher] = useState<Expense | null>(null);
  const [filterType, setFilterType] = useState("");
  const [eligibleRecipients, setEligibleRecipients] = useState<EligibleRecipient[]>([]);
  const [availableLimit, setAvailableLimit] = useState<number | null>(null);
  const [selectedRecipientEligible, setSelectedRecipientEligible] = useState<boolean | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [formError, setFormError] = useState("");
  const [closedDates, setClosedDates] = useState<Set<string>>(new Set());
  const [form, setForm] = useState({
    amount: "",
    recipient_name: "",
    recipient_id: "",
    description: "",
    type: "general_expense",
    date: getLocalDateString(),
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

  const fetchEligibleRecipients = useCallback(async (type: string) => {
    if (type !== "teacher_withdrawal" && type !== "secretary_advance") {
      setEligibleRecipients([]);
      setAvailableLimit(null);
      setSelectedRecipientEligible(null);
      return;
    }
    try {
      const res = await apiClient.get<EligibleRecipient[]>("/lms/expenses/eligible-recipients", { params: { type } });
      setEligibleRecipients(res.data);
    } catch (e) {
      console.error(e);
      setEligibleRecipients([]);
    }
  }, []);

  const fetchClosedDates = useCallback(async () => {
    try {
      const res = await apiClient.get<{ date: string; status: string }[]>("/lms/daily-closures");
      const closed = new Set(res.data.filter((c) => c.status === "closed").map((c) => c.date));
      setClosedDates(closed);
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    if (showForm) {
      fetchEligibleRecipients(form.type);
      fetchClosedDates();
      setForm((prev) => ({ ...prev, recipient_id: "", recipient_name: "" }));
      setAvailableLimit(null);
      setSelectedRecipientEligible(null);
    }
  }, [showForm, form.type, fetchEligibleRecipients]);

  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(null), 6000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  const handleTypeChange = (type: string) => {
    setForm({ ...form, type, recipient_id: "", recipient_name: "" });
    setAvailableLimit(null);
    setSelectedRecipientEligible(null);
    fetchEligibleRecipients(type);
  };

  const handleRecipientSelect = (id: string) => {
    const recipient = eligibleRecipients.find((r) => r.id === id);
    if (recipient) {
      setForm({ ...form, recipient_id: id, recipient_name: recipient.full_name });
      setAvailableLimit(recipient.available_limit);
      setSelectedRecipientEligible(recipient.is_eligible);
    } else {
      setForm({ ...form, recipient_id: "", recipient_name: "" });
      setAvailableLimit(null);
      setSelectedRecipientEligible(null);
    }
  };

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

  const expenseTypeMeta = (type: string) => {
    const variantMap: Record<string, string> = {
      general_expense: "general",
      teacher_withdrawal: "teacher",
      secretary_advance: "secretary",
    };
    const labelMap: Record<string, string> = {
      general_expense: t.generalExpense,
      teacher_withdrawal: t.teacherWithdrawal,
      secretary_advance: t.secretaryAdvance,
    };
    return { variant: variantMap[type] || "general", label: labelMap[type] || type };
  };

  const handleSave = async () => {
    if (!form.amount) return;
    if (form.type === "general_expense" && !form.recipient_name) return;
    if ((form.type === "teacher_withdrawal" || form.type === "secretary_advance") && !form.recipient_id) return;
    if (selectedRecipientEligible === false) {
      setMessage({ type: "error", text: t.recipientNotEligible });
      return;
    }
    const amount = parseFloat(form.amount);
    if (availableLimit !== null && amount > availableLimit) {
      setMessage({ type: "error", text: t.amountExceedsBalance });
      return;
    }
    try {
      const payload: Record<string, unknown> = {
        amount,
        recipient_name: form.recipient_name,
        type: form.type,
      };
      if (form.recipient_id) payload.recipient_id = form.recipient_id;
      if (form.description) payload.description = form.description;
      if (form.date) payload.date = form.date;
      const res = await apiClient.post("/lms/expenses", payload);
      setShowForm(false);
      setShowVoucher(res.data);
      fetchExpenses();
    } catch (e: any) {
      const detail = e?.response?.data?.detail || "";
      if (detail.includes("مقفل") || detail.toLowerCase().includes("closed")) {
        setFormError(t.dateIsClosed);
      } else {
        setFormError(detail || t.expenseError);
      }
    }
  };

  const formatDate = (d: string) => formatDisplayDate(d, locale);

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
          <Select
            value={filterType}
            onChange={setFilterType}
            options={[
              { value: "general_expense", label: t.generalExpense },
              { value: "teacher_withdrawal", label: t.teacherWithdrawal },
              { value: "secretary_advance", label: t.secretaryAdvance },
            ]}
            placeholder={t.all}
            className="w-36"
          />
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

      <Modal open={showForm} onClose={() => { setShowForm(false); setFormError(""); setSelectedRecipientEligible(null); }} title={t.add} size="xl">
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">{t.selectType}</label>
              <Select
                value={form.type}
                onChange={handleTypeChange}
                options={[
                  { value: "general_expense", label: t.generalExpense },
                  { value: "teacher_withdrawal", label: t.teacherWithdrawal },
                  { value: "secretary_advance", label: t.secretaryAdvance },
                ]}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {t.enterRecipient}
                {form.type === "secretary_advance" && <span className="text-purple-600 text-[10px] ms-2">({t.remainingStipend})</span>}
              </label>
              {form.type === "general_expense" ? (
                <input type="text" value={form.recipient_name} onChange={(e) => setForm({ ...form, recipient_name: e.target.value })} className="input-field" />
              ) : (
                <div className="space-y-1">
                  <Select
                    value={form.recipient_id}
                    onChange={handleRecipientSelect}
                    options={eligibleRecipients.map((r) => ({
                      value: r.id,
                      label: `${r.full_name}${form.type === "secretary_advance" ? ` (${r.available_limit.toFixed(2)} ${t.sar})` : ""} | ${r.is_eligible ? t.eligible : t.notEligible}`,
                    }))}
                    placeholder={t.selectRecipient}
                  />
                  {selectedRecipientEligible === false && (
                    <p className="text-xs text-red-600 font-medium">
                      ⚠ {t.ineligibleRecipientWarning}
                    </p>
                  )}
                  {form.type === "secretary_advance" && selectedRecipientEligible === true && availableLimit !== null && (
                    <p className="text-xs text-slate-500">
                      {t.limitLabel}: <span className="font-semibold text-slate-800">{availableLimit.toFixed(2)} {t.sar}</span>
                    </p>
                  )}
                </div>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">{t.enterAmount}</label>
              <input type="number" step="0.01" min="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="input-field" placeholder="0.00" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">{t.date}</label>
              <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="input-field" />
              {closedDates.has(form.date) && (
                <p className="text-xs text-red-600 font-medium mt-1">⚠ {t.dateIsClosed}</p>
              )}
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">{t.enterDescription}</label>
              <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="input-field" rows={2} />
            </div>
          </div>
          {formError && (
            <div className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">{formError}</div>
          )}
          <div className="flex gap-3 pt-2">
            <button onClick={handleSave} className="btn-primary">{t.save}</button>
            <button onClick={() => { setShowForm(false); setFormError(""); setSelectedRecipientEligible(null); }} className="btn-secondary">{t.cancel}</button>
          </div>
        </div>
      </Modal>

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
                <th>{t.createdBy}</th>
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
                  <td className="text-slate-600">{exp.created_by_name || "—"}</td>
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

      <ReceiptModal
        open={showVoucher !== null}
        onClose={() => setShowVoucher(null)}
        data={showVoucher ? {
          id: showVoucher.id,
          type: "expense",
          receipt_number: showVoucher.receipt_number,
          date: showVoucher.date,
          amount: showVoucher.amount,
          recipient_name: showVoucher.recipient_name,
          expense_type_label: expenseTypeMeta(showVoucher.type).label,
          expense_type_variant: expenseTypeMeta(showVoucher.type).variant as "general" | "teacher" | "secretary",
        } : null}
        locale={locale}
        isRtl={isRtl}
        instituteName={t.instituteName}
        cashierName={user?.full_name || ""}
      />
    </div>
  );
}
