"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { apiClient } from "@/lib/api";
import { AlertCircle, Users, Wallet, Banknote, TrendingUp } from "lucide-react";

interface PayrollRow {
  id: string;
  full_name: string;
  role: string;
  monthly_salary: number;
  total_drawn_this_month: number;
  remaining_balance: number;
}

interface PayrollData {
  month?: string | null;
  total_members: number;
  total_salary: number;
  total_drawn: number;
  total_remaining: number;
  members: PayrollRow[];
}

export default function StaffPayrollView({ month }: { month: string }) {
  const params = useParams();
  const locale = (params?.locale as string) || "ar";
  const isRtl = locale === "ar";

  const t = {
    ar: {
      totalMembers: "عدد الموظفين",
      totalSalary: "إجمالي الراتب",
      totalDrawn: "إجمالي المسحوب",
      totalRemaining: "الرصيد المتبقي",
      name: "الاسم",
      role: "الدور",
      salary: "الراتب الشهري",
      drawn: "مسحوب هذا الشهر",
      remaining: "المتبقي",
      error: "فشل تحميل سجل الرواتب",
      empty: "لا يوجد موظفون لهذا الشهر",
      monthLabel: "الشهر",
    },
    en: {
      totalMembers: "Staff Members",
      totalSalary: "Total Salary",
      totalDrawn: "Total Drawn",
      totalRemaining: "Total Remaining",
      name: "Name",
      role: "Role",
      salary: "Monthly Salary",
      drawn: "Drawn This Month",
      remaining: "Remaining",
      error: "Failed to load payroll register",
      empty: "No staff for this month",
      monthLabel: "Month",
    },
  }[locale === "en" ? "en" : "ar"];

  const [data, setData] = useState<PayrollData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (month) qs.set("month", `${month}-01`);
      const res = await apiClient.get<PayrollData>(
        `/reports/payroll${qs.toString() ? `?${qs.toString()}` : ""}`
      );
      setData(res.data);
    } catch {
      setError(t.error);
    } finally {
      setLoading(false);
    }
  }, [month, t.error]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 animate-pulse">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="card p-5 h-28" />
        ))}
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="card p-10 text-center text-sm text-red-600">
        <AlertCircle size={24} className="mx-auto mb-2 opacity-60" />
        {error ?? t.error}
      </div>
    );
  }

  const cards = [
    { label: t.totalMembers, value: data.total_members, color: "text-slate-800", icon: Users },
    { label: t.totalSalary, value: data.total_salary, color: "text-brand-600", icon: Wallet },
    { label: t.totalDrawn, value: data.total_drawn, color: "text-amber-600", icon: Banknote },
    { label: t.totalRemaining, value: data.total_remaining, color: "text-emerald-600", icon: TrendingUp },
  ];

  return (
    <div className="space-y-5" dir={isRtl ? "rtl" : "ltr"}>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="card p-5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-500">{card.label}</p>
                <Icon size={16} className={card.color} />
              </div>
              <p className={`text-xl font-bold mt-2 ${card.color}`}>{card.value}</p>
            </div>
          );
        })}
      </div>

      <div className="card p-5">
        {data.members.length === 0 ? (
          <p className="text-xs text-slate-400 py-8 text-center">{t.empty}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs text-slate-500">
                  <th className="text-start py-2 font-semibold">{t.name}</th>
                  <th className="text-start py-2 font-semibold">{t.role}</th>
                  <th className="text-start py-2 font-semibold">{t.salary}</th>
                  <th className="text-start py-2 font-semibold">{t.drawn}</th>
                  <th className="text-start py-2 font-semibold">{t.remaining}</th>
                </tr>
              </thead>
              <tbody>
                {data.members.map((row) => (
                  <tr key={row.id} className="border-b border-slate-50">
                    <td className="py-2 font-medium text-slate-800">{row.full_name}</td>
                    <td className="py-2">
                      <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-bold capitalize">
                        {row.role}
                      </span>
                    </td>
                    <td className="py-2 text-brand-600">{row.monthly_salary}</td>
                    <td className="py-2 text-amber-600">{row.total_drawn_this_month}</td>
                    <td className="py-2 text-emerald-600">{row.remaining_balance}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}