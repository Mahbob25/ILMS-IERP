"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiClient } from "@/lib/api";
import {
  ArrowLeft, Users, Mail, Wallet, BookOpen,
  Clock, AlertCircle, Loader2, CheckCircle, Phone,
  Calendar, MapPin, DollarSign, UserCheck, UserX, Shield,
} from "lucide-react";

interface EmployeeDetail {
  id: string;
  full_name: string;
  employee_type: string;
  phone_number: string | null;
  salary: number | null;
  hire_date: string | null;
  contract_end_date: string | null;
  address: string | null;
  is_active: boolean;
  linked_user: {
    id: string;
    email: string;
    full_name: string;
    role_name: string;
    is_active: boolean;
    is_superadmin: boolean;
  } | null;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  try { return new Date(dateStr).toLocaleDateString(); }
  catch { return dateStr; }
}

export default function EmployeeDetailPage() {
  const params = useParams();
  const router = useRouter();
  const locale = (params?.locale as string) || "ar";
  const employeeId = params?.id as string;
  const isRtl = locale === "ar";

  const [data, setData] = useState<EmployeeDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const t = {
    ar: {
      back: "العودة إلى الموظفين", hrInfo: "معلومات الموظف", type: "نوع الموظف",
      phone: "رقم الهاتف", salary: "الراتب", hireDate: "تاريخ التعيين",
      contractEnd: "نهاية العقد", address: "العنوان", status: "الحالة",
      active: "نشط", inactive: "غير نشط", access: "صلاحية النظام",
      hasAccess: "لديه صلاحية وصول", noAccess: "لا توجد صلاحية وصول",
      linkedUser: "حساب النظام المرتبط", email: "البريد الإلكتروني",
      role: "الدور", userStatus: "حالة الحساب",
    },
    en: {
      back: "Back to Employees", hrInfo: "Employee Information", type: "Employee Type",
      phone: "Phone", salary: "Salary", hireDate: "Hire Date",
      contractEnd: "Contract End", address: "Address", status: "Status",
      active: "Active", inactive: "Inactive", access: "System Access",
      hasAccess: "Has System Access", noAccess: "No System Access",
      linkedUser: "Linked User Account", email: "Email",
      role: "Role", userStatus: "Account Status",
    },
  }[locale === "en" ? "en" : "ar"];

  useEffect(() => {
    if (!employeeId) return;
    apiClient.get<EmployeeDetail>(`/employees/${employeeId}`)
      .then((res) => setData(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [employeeId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="animate-spin text-slate-400" size={24} />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-6xl mx-auto text-center py-20">
        <AlertCircle className="mx-auto text-red-400 mb-4" size={48} />
        <p className="text-red-500 font-medium">Employee not found</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto animate-fade-in" dir={isRtl ? "rtl" : "ltr"}>
      <button
        onClick={() => router.push(`/${locale}/dashboard/employees`)}
        className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900 transition-colors"
      >
        <ArrowLeft size={16} />
        <span>{t.back}</span>
      </button>

      <div className="card p-6">
        <div className="flex items-start gap-5 flex-wrap">
          <div className="w-16 h-16 rounded-2xl bg-brand-50 text-brand-600 flex items-center justify-center shrink-0">
            <Users size={32} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-xl font-bold text-slate-900">{data.full_name}</h2>
              <span className="badge bg-slate-100 text-slate-700 border-slate-200 capitalize">
                {data.employee_type}
              </span>
              <span className={`badge ${data.is_active ? "badge-success" : "bg-red-50 text-red-600 border border-red-100"}`}>
                {data.is_active ? t.active : t.inactive}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-2">
              {data.linked_user ? (
                <span className="badge bg-emerald-50 text-emerald-600 border-emerald-100 flex items-center gap-1">
                  <UserCheck size={14} /> {t.hasAccess}
                </span>
              ) : (
                <span className="badge bg-slate-50 text-slate-400 border-slate-200 flex items-center gap-1">
                  <UserX size={14} /> {t.noAccess}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="card p-5">
        <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
          <Users size={16} className="text-brand-500" />
          <span>{t.hrInfo}</span>
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div className="flex items-center gap-2 text-slate-600">
            <Phone size={14} className="text-slate-400" />
            <span className="text-slate-900 font-medium">{data.phone_number || "—"}</span>
          </div>
          <div className="flex items-center gap-2 text-slate-600">
            <DollarSign size={14} className="text-slate-400" />
            <span className="text-slate-900 font-medium">{data.salary !== null ? `${data.salary.toFixed(2)}` : "—"}</span>
          </div>
          <div className="flex items-center gap-2 text-slate-600">
            <Calendar size={14} className="text-slate-400" />
            <span className="text-slate-900 font-medium">{t.hireDate}: {formatDate(data.hire_date)}</span>
          </div>
          <div className="flex items-center gap-2 text-slate-600">
            <Calendar size={14} className="text-slate-400" />
            <span className="text-slate-900 font-medium">{t.contractEnd}: {formatDate(data.contract_end_date)}</span>
          </div>
          <div className="flex items-center gap-2 text-slate-600 md:col-span-2">
            <MapPin size={14} className="text-slate-400" />
            <span className="text-slate-900 font-medium">{data.address || "—"}</span>
          </div>
        </div>
      </div>

      {data.linked_user && (
        <div className="card p-5">
          <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
            <Shield size={16} className="text-brand-500" />
            <span>{t.linkedUser}</span>
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div className="flex items-center gap-2 text-slate-600">
              <Mail size={14} className="text-slate-400" />
              <span className="text-slate-900 font-medium">{data.linked_user.email}</span>
            </div>
            <div className="flex items-center gap-2 text-slate-600">
              <Shield size={14} className="text-slate-400" />
              <span className="text-slate-900 font-medium capitalize">{data.linked_user.role_name}</span>
            </div>
            <div className="flex items-center gap-2 text-slate-600">
              <UserCheck size={14} className="text-slate-400" />
              <span className={`badge ${data.linked_user.is_active ? "badge-success" : "bg-red-50 text-red-600 border-red-100"}`}>
                {data.linked_user.is_active ? t.active : t.inactive}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
