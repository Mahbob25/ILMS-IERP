"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { apiClient } from "@/lib/api";
import { sanitizeInput } from "@/lib/utils/input";
import EmptyState from "@/components/EmptyState";
import {
  Loader2,
  RefreshCw,
  AlertCircle,
  BarChart3,
  Calendar,
  ClipboardList,
  Activity,
  GraduationCap,
  Users,
  BookMarked,
  ClipboardCheck,
  Wallet,
  Banknote,
  Award,
  BookOpen,
  Printer,
  FileDown,
  Download,
  FileBarChart2,
} from "lucide-react";

interface ReportDescription {
  path: string;
  category: string;
  code: string;
  inputs: string[];
}

interface CatalogData {
  reports: ReportDescription[];
}

const CATEGORY_KEYS = ["financial", "operational", "teacher_hr"] as const;
type CategoryKey = (typeof CATEGORY_KEYS)[number];

export default function ReportsPage() {
  const params = useParams();
  const locale = (params?.locale as string) || "ar";
  const isRtl = locale === "ar";

  const t = {
    ar: {
      title: "التقارير",
      subtitle: "تقارير مالية وتشغيلية شاملة قابلة للطباعة والتصدير",
      loading: "جاري التحميل...",
      refresh: "تحديث",
      noData: "لا توجد بيانات متاحة",
      selectPrompt: "اختر تقريراً من القائمة لعرضه",
      comingSoon: "عرض التقرير قيد الإعداد وسيتوفر قريباً",
      exportNote: "أزرار التصدير ستعمل عند اكتمال كل مجموعة تقارير",
      print: "طباعة",
      pdf: "PDF",
      csv: "CSV",
      days7: "7 أيام",
      days30: "30 يوم",
      days90: "90 يوم",
      thisYear: "هذه السنة",
      custom: "مخصص",
      from: "من",
      to: "إلى",
      apply: "تطبيق",
      noPeriodFilter: "لا يحتاج هذا التقرير إلى فترة زمنية",
      categories: {
        financial: "المالية",
        operational: "التشغيلية",
        teacher_hr: "المعلمون والموارد البشرية",
      },
      inputs: {
        date_range: "فترة زمنية",
        single_date: "تاريخ محدد",
        single_month: "شهر محدد",
      },
      reports: {
        pnl_summary: { title: "ملخص الأرباح والخسائر", desc: "الإيرادات والمصروفات والمردودات لفترة" },
        daily_ledger: { title: "دفتر اليومية", desc: "تفاصيل معاملات يوم واحد" },
        closures_register: { title: "سجل الإغلاقات", desc: "حالة الإغلاق اليومي لكل تاريخ" },
        daily_reconciliation: { title: "التسوية اليومية", desc: "تقرير تسوية يومي" },
        student_register: { title: "سجل الطلاب", desc: "الطلاب النشطون وغير المسجلين" },
        enrollment_summary: { title: "ملخص التسجيلات", desc: "التسجيلات الجديدة حسب الفترة" },
        section_occupancy: { title: "إشغال الشعب", desc: "المسجل مقابل الطاقة الاستيعابية" },
        attendance_summary: { title: "ملخص الحضور", desc: "نسبة تغطية الحضور حسب الشعب" },
        teacher_wallets: { title: "أرصدة محافظ المعلمين", desc: "أرصدة المحافظ والقيود" },
        teacher_payouts: { title: "ملخص سحوبات المعلمين", desc: "السحوبات خلال الفترة" },
        staff_payroll: { title: "سجل رواتب الموظفين", desc: "رواتب شهر محدد" },
        grade_summary: { title: "ملخص الدرجات", desc: "توزيع الدرجات حسب الشعب" },
      },
    },
    en: {
      title: "Reports",
      subtitle: "Comprehensive financial and operational reports, printable and exportable",
      loading: "Loading...",
      refresh: "Refresh",
      noData: "No data available",
      selectPrompt: "Select a report from the list to view it",
      comingSoon: "Report view is being built and will be available soon",
      exportNote: "Export buttons will work once each report group is complete",
      print: "Print",
      pdf: "PDF",
      csv: "CSV",
      days7: "7 Days",
      days30: "30 Days",
      days90: "90 Days",
      thisYear: "This Year",
      custom: "Custom",
      from: "From",
      to: "To",
      apply: "Apply",
      noPeriodFilter: "This report does not need a period filter",
      categories: {
        financial: "Financial",
        operational: "Operational",
        teacher_hr: "Teacher & HR",
      },
      inputs: {
        date_range: "Date range",
        single_date: "Single date",
        single_month: "Single month",
      },
      reports: {
        pnl_summary: { title: "P&L Summary", desc: "Revenue, expenses and refunds for a period" },
        daily_ledger: { title: "Daily Ledger", desc: "Detailed transactions for a single day" },
        closures_register: { title: "Closures Register", desc: "Daily closure status per date" },
        daily_reconciliation: { title: "Daily Reconciliation", desc: "Daily reconciliation report" },
        student_register: { title: "Student Register", desc: "Active and unenrolled students" },
        enrollment_summary: { title: "Enrollment Summary", desc: "New enrollments per period" },
        section_occupancy: { title: "Section Occupancy", desc: "Enrolled vs capacity" },
        attendance_summary: { title: "Attendance Summary", desc: "Attendance coverage per section" },
        teacher_wallets: { title: "Teacher Wallet Balances", desc: "Wallet balances and ledger entries" },
        teacher_payouts: { title: "Teacher Payout Summary", desc: "Withdrawals per period" },
        staff_payroll: { title: "Staff Payroll Register", desc: "Monthly payroll register" },
        grade_summary: { title: "Grade Summary", desc: "Grade distribution by section" },
      },
    },
  }[locale === "en" ? "en" : "ar"];

  const [catalog, setCatalog] = useState<CatalogData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [period, setPeriod] = useState<"7d" | "30d" | "90d" | "year" | "custom">("30d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const fetchCatalog = useCallback(async () => {
    setFetchError(null);
    try {
      const res = await apiClient.get<CatalogData>("/reports/catalog");
      setCatalog(res.data);
    } catch {
      setCatalog(null);
      setFetchError("Failed to load report catalog");
    } finally {
      setLoading(false);
      setRefreshing(false);
      setSubmitting(false);
    }
  }, []);

  useEffect(() => {
    fetchCatalog();
  }, [fetchCatalog]);

  const handleRefresh = () => {
    if (submitting) return;
    setSubmitting(true);
    setRefreshing(true);
    fetchCatalog();
  };

  const reportsByCategory = (category: string): ReportDescription[] =>
    (catalog?.reports ?? []).filter((r) => r.category === category);

  const selectedReport = catalog?.reports.find((r) => r.path === selectedPath) ?? null;
  const needsDateRange = selectedReport?.inputs.includes("date_range") ?? false;

  if (loading) {
    return (
      <div className="space-y-6 max-w-7xl mx-auto animate-pulse">
        <div className="card p-5 h-16" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="card p-5 h-36" />
          ))}
        </div>
      </div>
    );
  }

  const dir = isRtl ? "rtl" : "ltr";

  const periodButtons = [
    { key: "7d", label: t.days7 },
    { key: "30d", label: t.days30 },
    { key: "90d", label: t.days90 },
    { key: "year", label: t.thisYear },
    { key: "custom", label: t.custom },
  ] as const;

  const categoryIcons: Record<CategoryKey, React.ElementType> = {
    financial: BarChart3,
    operational: Activity,
    teacher_hr: GraduationCap,
  };

  const reportIcons: Record<string, React.ElementType> = {
    pnl_summary: BarChart3,
    daily_ledger: Calendar,
    closures_register: ClipboardList,
    daily_reconciliation: ClipboardCheck,
    student_register: Users,
    enrollment_summary: BookMarked,
    section_occupancy: BookOpen,
    attendance_summary: Activity,
    teacher_wallets: Wallet,
    teacher_payouts: Banknote,
    staff_payroll: Award,
    grade_summary: ClipboardCheck,
  };

  const exportButtons = [
    { key: "print", label: t.print, icon: Printer },
    { key: "pdf", label: t.pdf, icon: FileDown },
    { key: "csv", label: t.csv, icon: Download },
  ] as const;

  return (
    <div className="space-y-6 max-w-7xl mx-auto animate-fade-in" dir={dir}>
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">{t.title}</h1>
          <p className="text-sm text-slate-500">{t.subtitle}</p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={submitting}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
        >
          <RefreshCw size={15} className={refreshing ? "animate-spin" : ""} />
          {t.refresh}
        </button>
      </div>

      {fetchError && (
        <div className="flex items-center gap-2 p-4 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
          <AlertCircle size={16} />
          <span>{fetchError}</span>
          <button onClick={() => setFetchError(null)} className="ms-auto text-red-400 hover:text-red-600">
            &times;
          </button>
        </div>
      )}

      {!catalog || catalog.reports.length === 0 ? (
        <EmptyState title={t.noData} message="" />
      ) : (
        <>
          {/* Report Picker — grouped by category */}
          {CATEGORY_KEYS.map((category) => {
            const reports = reportsByCategory(category);
            if (reports.length === 0) return null;
            const CategoryIcon = categoryIcons[category];
            return (
              <section key={category} className="space-y-3">
                <div className="flex items-center gap-2">
                  <CategoryIcon size={16} className="text-brand-600" />
                  <h2 className="text-sm font-bold text-slate-900">{t.categories[category]}</h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {reports.map((report) => {
                    const meta = t.reports[report.code as keyof typeof t.reports];
                    const Icon = reportIcons[report.code] ?? FileBarChart2;
                    const isSelected = selectedPath === report.path;
                    return (
                      <button
                        key={report.path}
                        onClick={() => setSelectedPath(report.path)}
                        className={`card p-5 text-start transition-all ${
                          isSelected
                            ? "border-brand-300 ring-2 ring-brand-100"
                            : "hover:border-slate-300"
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div className="w-10 h-10 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center shrink-0">
                            <Icon size={20} />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-slate-900">{meta?.title ?? report.code}</p>
                            <p className="text-xs text-slate-500 mt-0.5">{meta?.desc ?? ""}</p>
                            <div className="flex flex-wrap gap-1.5 mt-2">
                              {report.inputs.map((input) => (
                                <span
                                  key={input}
                                  className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 text-[10px] font-semibold"
                                >
                                  {t.inputs[input as keyof typeof t.inputs] ?? input}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </>
      )}

      {/* Period Filter — only for reports that need a date range */}
      {selectedReport && (
        <div className="card p-4">
          {needsDateRange ? (
            <div className="flex items-center gap-2 flex-wrap">
              {periodButtons.map((btn) => (
                <button
                  key={btn.key}
                  onClick={() => setPeriod(btn.key)}
                  className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                    period === btn.key
                      ? "bg-brand-50 text-brand-600 border-brand-200"
                      : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  {btn.label}
                </button>
              ))}
              {period === "custom" && (
                <div className="flex items-center gap-2 ms-2">
                  <input
                    type="date"
                    value={customFrom}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setCustomFrom(sanitizeInput(e.target.value))
                    }
                    className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs"
                  />
                  <span className="text-xs text-slate-500">{t.to}</span>
                  <input
                    type="date"
                    value={customTo}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setCustomTo(sanitizeInput(e.target.value))
                    }
                    className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs"
                  />
                  <button className="px-3 py-1.5 rounded-lg bg-brand-50 text-brand-600 text-xs font-semibold border border-brand-200">
                    {t.apply}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-slate-500">{t.noPeriodFilter}</p>
          )}

          {/* Export Toolbar */}
          <div className="flex items-center gap-2 flex-wrap mt-4 pt-4 border-t border-slate-100">
            {exportButtons.map((btn) => {
              const Icon = btn.icon;
              return (
                <button
                  key={btn.key}
                  disabled
                  title={t.exportNote}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-50 border border-slate-200 text-sm font-medium text-slate-400 cursor-not-allowed"
                >
                  <Icon size={15} />
                  {btn.label}
                </button>
              );
            })}
            <span className="text-[11px] text-slate-400 ms-auto">{t.exportNote}</span>
          </div>
        </div>
      )}

      {/* Content Area — report views land here in later phases */}
      {selectedReport ? (
        <div className="card p-10 text-center">
          <Loader2 size={28} className="mx-auto text-slate-300 mb-3" />
          <p className="text-sm font-medium text-slate-500">{t.comingSoon}</p>
        </div>
      ) : (
        <EmptyState title={t.selectPrompt} message="" />
      )}
    </div>
  );
}
