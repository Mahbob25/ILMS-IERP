"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiClient } from "@/lib/api";
import ConfirmModal from "@/components/ConfirmModal";
import {
  Users,
  BookOpen,
  DollarSign,
  Wallet,
  AlertCircle,
  CheckCircle,
  Clock,
  RotateCcw,
  UserX,
  Workflow,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface PendingAmendment {
  id: string;
  contract_id: string;
  section_name: string;
  course_name: string;
  teacher_name: string;
  compensation_model: string | null;
  current_amount: number | null;
  requested_amount: number | null;
  reason: string;
  requested_by_name: string;
  requested_at: string;
}

interface UnlockRequest {
  date: string;
  requested_by: string | null;
}

interface ManagerDashboardData {
  total_students: number;
  total_courses: number;
  total_teachers: number;
  monthly_revenue: number;
  monthly_expenses: number;
  monthly_refunds: number;
  pending_unlock_requests: UnlockRequest[];
  pending_withdrawals_count: number;
  recent_activity_count: number;
}

export default function ManagerDashboard() {
  const router = useRouter();
  const params = useParams();
  const locale = (params?.locale as string) || "ar";
  const currencySymbol = locale === "ar" ? "ريال" : "YER";
  const [data, setData] = useState<ManagerDashboardData | null>(null);
  const [amendments, setAmendments] = useState<PendingAmendment[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [recentUnenrollments, setRecentUnenrollments] = useState<any[]>([]);
  const [showUnenrollments, setShowUnenrollments] = useState(false);
  const [confirmAmendment, setConfirmAmendment] = useState<{
    id: string;
    action: "approve" | "reject";
  } | null>(null);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const fetchDashboardData = useCallback(() => {
    Promise.all([
      apiClient.get<ManagerDashboardData>("/dashboard/manager").then((res) => setData(res.data)).catch(() => setFetchError(true)),
      apiClient.get<PendingAmendment[]>("/lms/amendments/pending").then((res) => setAmendments(res.data)).catch(() => {}),
      apiClient.get<{ items: any[]; total: number }>("/academic/enrollments/unenrollment-history?per_page=5").then((res) => setRecentUnenrollments(res.data.items)).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  const t = {
    ar: {
      students: "إجمالي الطلاب",
      courses: "المقررات النشطة",
      revenue: "الإيرادات الشهرية",
      expenses: "المصروفات الشهرية",
      refunds: "المردودات الشهرية",
      pendingApprovals: "طلبات الموافقة",
      unlockRequests: "طلب فتح إغلاق",
      withdrawals: "سحوبات معلقة",
      recentActivity: "نشاطات هذا الشهر",
      noApprovals: "لا توجد طلبات معلقة",
      revVsExp: "الإيرادات vs المصروفات",
      confirmApproveTitle: "تأكيد الموافقة",
      confirmApproveMsg: "هل أنت متأكد من الموافقة على طلب الزيادة هذا؟",
      confirmRejectTitle: "تأكيد الرفض",
      confirmRejectMsg: "هل أنت متأكد من رفض طلب الزيادة هذا؟",
      confirmYes: "تأكيد",
      cancel: "إلغاء",
      approveSuccess: "تمت الموافقة على طلب الزيادة",
      rejectSuccess: "تم رفض طلب الزيادة",
      requestError: "فشل في تنفيذ العملية",
      recentUnenrollments: "آخر عمليات إلغاء التسجيل",
      noUnenrollments: "لا توجد عمليات إلغاء تسجيل حديثة",
      student: "الطالب",
      section: "الشعبة",
      unenrolledBy: "بواسطة",
      showMore: "عرض المزيد",
      refund: "استرداد",
      quickActions: "إجراءات سريعة",
      quickRegistration: "تسجيل سريع",
    },
    en: {
      students: "Total Students",
      courses: "Active Courses",
      revenue: "Monthly Revenue",
      expenses: "Monthly Expenses",
      refunds: "Monthly Refunds",
      pendingApprovals: "Pending Approvals",
      unlockRequests: "Unlock Requests",
      withdrawals: "Pending Withdrawals",
      recentActivity: "This Month's Activity",
      noApprovals: "No pending requests",
      revVsExp: "Revenue vs Expenses",
      confirmApproveTitle: "Confirm Approval",
      confirmApproveMsg: "Are you sure you want to approve this increase request?",
      confirmRejectTitle: "Confirm Rejection",
      confirmRejectMsg: "Are you sure you want to reject this increase request?",
      confirmYes: "Confirm",
      cancel: "Cancel",
      approveSuccess: "Increase request approved",
      rejectSuccess: "Increase request rejected",
      requestError: "Failed to process request",
      recentUnenrollments: "Recent Unenrollments",
      noUnenrollments: "No recent unenrollments",
      student: "Student",
      section: "Section",
      unenrolledBy: "By",
      showMore: "Show More",
      refund: "Refund",
      quickActions: "Quick Actions",
      quickRegistration: "Quick Registration",
    },
  }[locale === "en" ? "en" : "ar"];

  if (loading) {
    return (
      <div className="space-y-6 max-w-6xl mx-auto animate-pulse">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="card h-20" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="card p-5 h-64" />
          <div className="card p-5 h-64" />
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-6xl mx-auto text-center py-20">
        <AlertCircle className="mx-auto text-red-400 mb-4" size={48} />
        <p className="text-red-500 font-medium">Failed to load dashboard</p>
      </div>
    );
  }

  const chartData = [
    { name: locale === "ar" ? "الإيرادات" : "Revenue", value: data.monthly_revenue },
    { name: locale === "ar" ? "المصروفات" : "Expenses", value: data.monthly_expenses },
    { name: locale === "ar" ? "المردودات" : "Refunds", value: data.monthly_refunds },
  ];

  return (
    <><div className="space-y-6 max-w-6xl mx-auto animate-fade-in">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <Users size={20} />
          </div>
          <div>
            <p className="text-xl font-bold text-slate-900">{data.total_students}</p>
            <p className="text-xs text-slate-500">{t.students}</p>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <BookOpen size={20} />
          </div>
          <div>
            <p className="text-xl font-bold text-slate-900">{data.total_courses}</p>
            <p className="text-xs text-slate-500">{t.courses}</p>
          </div>
        </div>
        <button
          onClick={() => router.push(`/${locale}/dashboard/revenue`)}
          className="card p-4 flex items-center gap-3 group hover:ring-2 hover:ring-brand-200 transition-all text-end"
        >
          <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <DollarSign size={20} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xl font-bold text-slate-900 truncate">{data.monthly_revenue.toFixed(2)} {currencySymbol}</p>
            <p className="text-xs text-slate-500">{t.revenue}</p>
          </div>
          <span className="text-[10px] text-brand-500 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            {locale === "ar" ? "عرض التفاصيل ←" : "View Details →"}
          </span>
        </button>
        <div className="card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
            <RotateCcw size={20} />
          </div>
          <div>
            <p className="text-xl font-bold text-slate-900">{data.monthly_refunds.toFixed(2)} {currencySymbol}</p>
            <p className="text-xs text-slate-500">{t.refunds}</p>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-red-50 text-red-600 flex items-center justify-center shrink-0">
            <Wallet size={20} />
          </div>
          <div>
            <p className="text-xl font-bold text-slate-900">{data.monthly_expenses.toFixed(2)} {currencySymbol}</p>
            <p className="text-xs text-slate-500">{t.expenses}</p>
          </div>
        </div>
      </div>

      <div className="card p-5">
        <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
          <Workflow size={16} className="text-rose-500" />
          <span>{t.quickActions}</span>
        </h3>
        <button
          onClick={() => router.push(`/${locale}/dashboard/wizards/student-enrollment`)}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-lg bg-rose-50 text-rose-700 border border-rose-100 hover:bg-rose-100 transition-all text-sm font-medium"
        >
          <Workflow size={18} />
          <span>{t.quickRegistration}</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-5">
          <h3 className="text-sm font-bold text-slate-900 mb-4">{t.revVsExp}</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: "#64748b" }} />
              <YAxis tick={{ fontSize: 12, fill: "#64748b" }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#fff",
                  border: "1px solid #e2e8f0",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
              />
              <Bar dataKey="value" fill="#10b981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card p-5">
          <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
            <AlertCircle size={16} className="text-amber-500" />
            <span>{t.pendingApprovals}</span>
          </h3>
          {message && (
            <div
              className={`mb-3 px-3 py-2 rounded-lg text-sm ${
                message.type === "success"
                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                  : "bg-red-50 text-red-700 border border-red-200"
              }`}
            >
              {message.text}
            </div>
          )}
          {data.pending_unlock_requests.length === 0 && data.pending_withdrawals_count === 0 && amendments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-slate-400">
              <CheckCircle size={40} className="mb-3 text-emerald-300" />
              <p className="text-sm">{t.noApprovals}</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-80 overflow-y-auto">
              {amendments.map((am) => (
                <div key={am.id} className="py-2 px-3 rounded-lg bg-amber-50 border border-amber-100">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <DollarSign size={14} className="text-amber-500" />
                      <span className="text-sm font-medium text-slate-900">
                        {am.teacher_name} — {am.course_name}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setConfirmAmendment({ id: am.id, action: "approve" })}
                        className="p-1 rounded text-emerald-600 hover:bg-emerald-100"
                        title="Approve"
                      >
                        <CheckCircle size={14} />
                      </button>
                      <button
                        onClick={() => setConfirmAmendment({ id: am.id, action: "reject" })}
                        className="p-1 rounded text-red-500 hover:bg-red-100"
                        title="Reject"
                      >
                        <AlertCircle size={14} />
                      </button>
                    </div>
                  </div>
                  <div className="text-xs text-slate-500 ms-6">
                    {am.compensation_model === "fixed"
                      ? `SAR ${am.current_amount ?? "—"} → SAR ${am.requested_amount ?? "—"}`
                      : `${am.current_amount ?? "—"}% → ${am.requested_amount ?? "—"}%`
                    }
                    <span className="mx-1">·</span>
                    {am.reason}
                  </div>
                </div>
              ))}
              {data.pending_unlock_requests.map((req) => (
                <div key={req.date} className="flex items-center justify-between py-2 px-3 rounded-lg bg-amber-50 border border-amber-100">
                  <div className="flex items-center gap-2">
                    <Clock size={16} className="text-amber-500" />
                    <span className="text-sm font-medium text-slate-900">{t.unlockRequests}: {req.date}</span>
                  </div>
                </div>
              ))}
              {data.pending_withdrawals_count > 0 && (
                <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-amber-50 border border-amber-100">
                  <div className="flex items-center gap-2">
                    <Wallet size={16} className="text-amber-500" />
                    <span className="text-sm font-medium text-slate-900">{t.withdrawals}: {data.pending_withdrawals_count}</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="card p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <Users size={20} />
          </div>
          <div>
            <p className="text-xl font-bold text-slate-900">{data.recent_activity_count}</p>
            <p className="text-xs text-slate-500">{t.recentActivity}</p>
          </div>
        </div>
      </div>

      {/* Recent Unenrollments */}
      <div className="card overflow-hidden">
        <button
          onClick={() => setShowUnenrollments(!showUnenrollments)}
          className="w-full p-5 flex items-center gap-3 text-start hover:bg-slate-50 transition-colors"
        >
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
            <UserX size={20} />
          </div>
          <div className="flex-1">
            <p className="text-sm font-bold text-slate-900">{t.recentUnenrollments}</p>
            <p className="text-xs text-slate-500">{recentUnenrollments.length} {locale === "ar" ? "عملية" : "records"}</p>
          </div>
          {showUnenrollments ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
        </button>
        {showUnenrollments && (
          <div className="px-5 pb-5 border-t border-slate-200 pt-4">
            {recentUnenrollments.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-4">{t.noUnenrollments}</p>
            ) : (
              <div className="space-y-3">
                {recentUnenrollments.map((rec: any) => (
                  <div key={rec.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-slate-50">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-slate-900">{rec.student_name}</p>
                      <p className="text-xs text-slate-500">
                        {rec.section_name || rec.course_name}
                        <span className="mx-1">·</span>
                        {t.unenrolledBy} {rec.unenrolled_by_name || rec.unenrolled_by?.slice(0, 8)}
                      </p>
                    </div>
                    {rec.refund_authorized_amount > 0 && (
                      <span className="text-xs font-semibold text-amber-600">
                        {rec.refund_authorized_amount.toFixed(2)}
                      </span>
                    )}
                  </div>
                ))}
                <button
                  onClick={() => router.push(`/${locale}/dashboard/enrollments`)}
                  className="text-xs text-brand-600 hover:text-brand-700 font-medium"
                >
                  {t.showMore} →
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>

    <ConfirmModal
      open={confirmAmendment !== null}
      title={
        confirmAmendment?.action === "approve"
          ? t.confirmApproveTitle
          : t.confirmRejectTitle
      }
      message={
        confirmAmendment?.action === "approve"
          ? t.confirmApproveMsg
          : t.confirmRejectMsg
      }
      confirmLabel={t.confirmYes}
      cancelLabel={t.cancel}
      isRtl={locale === "ar"}
      onConfirm={async () => {
        if (!confirmAmendment) return;
        const { id, action } = confirmAmendment;
        setConfirmAmendment(null);
        setMessage(null);
        try {
          await apiClient.put(`/lms/amendments/${id}/${action}`);
          setAmendments((prev) => prev.filter((a) => a.id !== id));
          fetchDashboardData();
          setMessage({
            type: "success",
            text: action === "approve" ? t.approveSuccess : t.rejectSuccess,
          });
        } catch {
          setMessage({
            type: "error",
            text: t.requestError,
          });
        }
      }}
      onCancel={() => setConfirmAmendment(null)}
    /></>
  );
}
