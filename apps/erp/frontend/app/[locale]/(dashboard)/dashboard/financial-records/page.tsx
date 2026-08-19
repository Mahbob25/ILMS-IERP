"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { apiClient } from "@/lib/api";
import { useAuth } from "@/components/AuthContext";
import Select from "@/components/ui/Select";
import { Loader2, RefreshCw, Eye, Search, X, AlertCircle } from "lucide-react";
import { escapeLikeWildcards } from "@/lib/utils/input";
import ReceiptModal from "@/components/ReceiptModal";
import RefundReceipt from "@/components/cashier/RefundReceipt";
import { formatDisplayDate } from "@/lib/dates";
import TableContainer from '@/components/ui/TableContainer';

interface FinancialRecord {
  doc_type: "receipt" | "voucher" | "refund";
  source_id: string;
  receipt_number: string;
  date: string;
  amount: number;
  counterparty: string;
  created_by_name: string;
  detail: string;
  preview_url: string;
  student_code: string | null;
  course_name: string | null;
  payment_method: string | null;
  transaction_number: string | null;
  expense_type: string | null;
  notes: string | null;
}

interface FinancialRecordListResponse {
  items: FinancialRecord[];
  total: number;
}

const PAGE_SIZE = 50;

export default function FinancialRecordsPage() {
  const params = useParams();
  const { user } = useAuth();
  const locale = (params?.locale as string) || "ar";
  const isRtl = locale === "ar";

  const t = {
    ar: {
      title: "السجل المالي",
      subtitle: "أرشيف الإيصالات والسندات الموحد",
      docType: "نوع المستند",
      all: "الكل",
      receipt: "إيصال",
      voucher: "سند صرف",
      refund: "إيصال صرف",
      receiptNumber: "الرقم",
      date: "التاريخ",
      amount: "المبلغ",
      counterparty: "الطرف",
      createdBy: "تم بواسطة",
      actions: "الإجراءات",
      preview: "معاينة",
      dateFrom: "من تاريخ",
      dateTo: "إلى تاريخ",
      searchReceipt: "بحث بالرقم",
      searchName: "بحث بالاسم",
      loading: "جاري التحميل...",
      empty: "لا توجد مستندات مطابقة",
      refresh: "تحديث",
      showing: "عرض",
      of: "من",
      prev: "السابق",
      next: "التالي",
      sar: "ريال",
      unknown: "غير معروف",
      fetchFailed: "فشل تحميل السجل المالي",
      currency: "ريال",
      generalExpense: "مصروف عام",
      teacherWithdrawal: "سحب معلم",
      salaryDraw: "راتب موظف",
      instituteName: "Al-Drasat ERP",
    },
    en: {
      title: "Financial Records",
      subtitle: "Central archive of receipts and vouchers",
      docType: "Document Type",
      all: "All",
      receipt: "Receipt",
      voucher: "Voucher",
      refund: "Refund",
      receiptNumber: "Number",
      date: "Date",
      amount: "Amount",
      counterparty: "Counterparty",
      createdBy: "Created By",
      actions: "Actions",
      preview: "Preview",
      dateFrom: "From Date",
      dateTo: "To Date",
      searchReceipt: "Search by number",
      searchName: "Search by name",
      loading: "Loading...",
      empty: "No matching documents",
      refresh: "Refresh",
      showing: "Showing",
      of: "of",
      prev: "Previous",
      next: "Next",
      sar: "SAR",
      unknown: "Unknown",
      fetchFailed: "Failed to load financial records",
      currency: "SAR",
      generalExpense: "General Expense",
      teacherWithdrawal: "Teacher Withdrawal",
      salaryDraw: "Staff Salary",
      instituteName: "Al-Drasat ERP",
    },
  }[locale === "en" ? "en" : "ar"];

  const [records, setRecords] = useState<FinancialRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [docType, setDocType] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [nameSearch, setNameSearch] = useState("");
  const [debouncedName, setDebouncedName] = useState("");
  const [showReceipt, setShowReceipt] = useState<FinancialRecord | null>(null);
  const [showRefund, setShowRefund] = useState<FinancialRecord | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedName(nameSearch), 300);
    return () => clearTimeout(timer);
  }, [nameSearch]);

  const fetchRecords = useCallback(async () => {
    try {
      const params: Record<string, string> = { limit: String(PAGE_SIZE) };
      if (docType) params.doc_type = docType;
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      if (debouncedSearch) params.search = escapeLikeWildcards(debouncedSearch);
      if (debouncedName) params.name = escapeLikeWildcards(debouncedName);
      if (offset > 0) params.offset = String(offset);
      const res = await apiClient.get<FinancialRecordListResponse>(
        "/lms/financial-records",
        { params },
      );
      setRecords(res.data.items);
      setTotal(res.data.total);
      setFetchError(null);
    } catch (e) {
      setFetchError(t.fetchFailed);
    }
  }, [docType, dateFrom, dateTo, debouncedSearch, debouncedName, offset, t.fetchFailed]);

  useEffect(() => {
    setLoading(true);
    fetchRecords().finally(() => setLoading(false));
  }, [fetchRecords]);

  const handleFilterChange = () => {
    setOffset(0);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchRecords();
    setRefreshing(false);
  };

  const expenseTypeMeta = (type: string) => {
    const variantMap: Record<string, string> = {
      general_expense: "general",
      teacher_withdrawal: "teacher",
      salary_draw: "salary",
    };
    const labelMap: Record<string, string> = {
      general_expense: t.generalExpense,
      teacher_withdrawal: t.teacherWithdrawal,
      salary_draw: t.salaryDraw,
    };
    return {
      variant: variantMap[type] || "general",
      label: labelMap[type] || type,
    };
  };

  const typeBadge = (record: FinancialRecord) => {
    if (record.doc_type === "receipt") {
      return (
        <span className="badge badge-success">{t.receipt}</span>
      );
    }
    if (record.doc_type === "voucher") {
      return <span className="badge badge-warning">{t.voucher}</span>;
    }
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border bg-sky-50 text-sky-600 border-sky-200">
        {t.refund}
      </span>
    );
  };

  const handlePreview = (record: FinancialRecord) => {
    if (record.doc_type === "refund") {
      setShowRefund(record);
    } else {
      setShowReceipt(record);
    }
  };

  const formatDate = (d: string) => formatDisplayDate(d, locale);

  const shownStart = total > 0 ? offset + 1 : 0;
  const shownEnd = offset + records.length;

  return (
    <div
      className="space-y-6 max-w-6xl mx-auto animate-fade-in"
      dir={isRtl ? "rtl" : "ltr"}
    >
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">{t.title}</h2>
          <p className="text-sm text-slate-500 mt-1">{t.subtitle}</p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="btn-icon"
          title={t.refresh}
        >
          <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={docType}
          onChange={(value) => {
            setDocType(value);
            handleFilterChange();
          }}
          options={[
            { value: "", label: t.all },
            { value: "receipt", label: t.receipt },
            { value: "voucher", label: t.voucher },
            { value: "refund", label: t.refund },
          ]}
          placeholder={t.all}
          className="w-40"
        />
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => {
            setDateFrom(e.target.value);
            handleFilterChange();
          }}
          className="input-field w-40 text-sm"
          title={t.dateFrom}
        />
        <input
          type="date"
          value={dateTo}
          onChange={(e) => {
            setDateTo(e.target.value);
            handleFilterChange();
          }}
          className="input-field w-40 text-sm"
          title={t.dateTo}
        />
        <div className="relative">
          <Search
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              handleFilterChange();
            }}
            placeholder={t.searchReceipt}
            className="input-field pl-8 w-40 text-sm"
          />
          {search && (
            <button
              onClick={() => {
                setSearch("");
                handleFilterChange();
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X size={14} />
            </button>
          )}
        </div>
        <div className="relative">
          <Search
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
          />
          <input
            type="text"
            value={nameSearch}
            onChange={(e) => {
              setNameSearch(e.target.value);
              handleFilterChange();
            }}
            placeholder={t.searchName}
            className="input-field pl-8 w-44 text-sm"
          />
          {nameSearch && (
            <button
              onClick={() => {
                setNameSearch("");
                handleFilterChange();
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {fetchError && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-medium bg-red-50 text-red-700 border border-red-200">
          <AlertCircle size={16} />
          {fetchError}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="animate-spin text-slate-400" size={24} />
        </div>
      ) : records.length === 0 ? (
        <div className="card p-8 text-center text-sm text-slate-500">
          {t.empty}
        </div>
      ) : (
        <>
          <div className="card overflow-hidden">
            <TableContainer>
              <table className="data-table">
              <thead>
                <tr>
                  <th>{t.docType}</th>
                  <th>{t.receiptNumber}</th>
                  <th>{t.date}</th>
                  <th>{t.amount}</th>
                  <th>{t.counterparty}</th>
                  <th>{t.createdBy}</th>
                  <th>{t.actions}</th>
                </tr>
              </thead>
              <tbody>
                {records.map((record) => (
                  <tr key={`${record.doc_type}-${record.source_id}`}>
                    <td>{typeBadge(record)}</td>
                    <td>
                      <span className="badge badge-muted font-mono">
                        {record.receipt_number}
                      </span>
                    </td>
                    <td className="text-slate-500">
                      {formatDate(record.date)}
                    </td>
                    <td className="font-semibold text-slate-900">
                      {record.amount.toFixed(2)} {t.sar}
                    </td>
                    <td className="font-medium text-slate-900">
                      {record.counterparty || t.unknown}
                    </td>
                    <td className="text-slate-600">
                      {record.created_by_name || "—"}
                    </td>
                    <td>
                      <button
                        onClick={() => handlePreview(record)}
                        className="btn-icon"
                        title={t.preview}
                      >
                        <Eye size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
        </TableContainer>
          </div>

          <div className="flex items-center justify-between text-sm text-slate-600">
            <span>
              {t.showing} {shownStart}–{shownEnd} {t.of} {total}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setOffset((prev) => Math.max(0, prev - PAGE_SIZE))}
                disabled={offset === 0}
                className="btn-secondary text-sm disabled:opacity-40"
              >
                {t.prev}
              </button>
              <button
                onClick={() => setOffset((prev) => prev + PAGE_SIZE)}
                disabled={offset + records.length >= total}
                className="btn-secondary text-sm disabled:opacity-40"
              >
                {t.next}
              </button>
            </div>
          </div>
        </>
      )}

      <ReceiptModal
        open={showReceipt !== null}
        onClose={() => setShowReceipt(null)}
        data={
          showReceipt
            ? {
                id: showReceipt.source_id,
                type: showReceipt.doc_type === "voucher" ? "expense" : "payment",
                receipt_number: showReceipt.receipt_number,
                date: showReceipt.date,
                amount: showReceipt.amount,
                student_name:
                  showReceipt.doc_type === "receipt" ? showReceipt.counterparty : undefined,
                course_name: showReceipt.course_name ?? undefined,
                payment_method: showReceipt.payment_method ?? undefined,
                transaction_number: showReceipt.transaction_number,
                recipient_name:
                  showReceipt.doc_type === "voucher" ? showReceipt.counterparty : undefined,
                expense_type_label:
                  showReceipt.doc_type === "voucher"
                    ? expenseTypeMeta(showReceipt.expense_type ?? "").label
                    : undefined,
                expense_type_variant:
                  showReceipt.doc_type === "voucher"
                    ? (expenseTypeMeta(showReceipt.expense_type ?? "")
                        .variant as "general" | "teacher" | "secretary" | "salary")
                    : undefined,
              }
            : null
        }
        locale={locale}
        isRtl={isRtl}
        instituteName={t.instituteName}
        cashierName={user?.full_name || ""}
      />

      <RefundReceipt
        open={showRefund !== null}
        onClose={() => setShowRefund(null)}
        isRtl={isRtl}
        locale={locale}
        data={
          showRefund
            ? {
                receiptNumber: showRefund.receipt_number,
                studentName: showRefund.counterparty || t.unknown,
                studentCode: showRefund.student_code || "",
                amount: showRefund.amount,
                date: formatDate(showRefund.date),
                cashierName: user?.full_name || "",
                currency: t.currency,
                notes: showRefund.notes ?? undefined,
              }
            : {
                receiptNumber: "",
                studentName: "",
                studentCode: "",
                amount: 0,
                date: "",
                cashierName: "",
                currency: t.currency,
              }
        }
      />
    </div>
  );
}
