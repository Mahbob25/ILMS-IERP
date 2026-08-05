"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { apiClient } from "@/lib/api";
import { AlertCircle, Wallet, Lock, CheckCircle2, ListChecks } from "lucide-react";

interface WalletRow {
  teacher_id: string;
  teacher_name: string;
  balance: number;
  frozen_balance: number;
  available: number;
  entry_count: number;
}

interface TeacherWalletsData {
  total_wallets: number;
  total_balance: number;
  total_frozen: number;
  total_available: number;
  wallets: WalletRow[];
}

export default function TeacherWalletsView() {
  const params = useParams();
  const locale = (params?.locale as string) || "ar";
  const isRtl = locale === "ar";

  const t = {
    ar: {
      totalWallets: "عدد المحافظ",
      totalBalance: "إجمالي الرصيد",
      totalFrozen: "رصيد مجمد",
      totalAvailable: "رصيد متاح",
      teacher: "المعلم",
      balance: "الرصيد",
      frozen: "المجمد",
      available: "المتاح",
      entries: "عدد القيود",
      error: "فشل تحميل أرصدة المحافظ",
      empty: "لا توجد محافظ معلمين",
    },
    en: {
      totalWallets: "Wallets",
      totalBalance: "Total Balance",
      totalFrozen: "Frozen",
      totalAvailable: "Available",
      teacher: "Teacher",
      balance: "Balance",
      frozen: "Frozen",
      available: "Available",
      entries: "Ledger Entries",
      error: "Failed to load teacher wallets",
      empty: "No teacher wallets",
    },
  }[locale === "en" ? "en" : "ar"];

  const [data, setData] = useState<TeacherWalletsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get<TeacherWalletsData>("/reports/teachers/wallets");
      setData(res.data);
    } catch {
      setError(t.error);
    } finally {
      setLoading(false);
    }
  }, [t.error]);

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
    { label: t.totalWallets, value: data.total_wallets, color: "text-slate-800", icon: Wallet },
    { label: t.totalBalance, value: data.total_balance, color: "text-emerald-600", icon: ListChecks },
    { label: t.totalFrozen, value: data.total_frozen, color: "text-amber-600", icon: Lock },
    { label: t.totalAvailable, value: data.total_available, color: "text-brand-600", icon: CheckCircle2 },
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
        {data.wallets.length === 0 ? (
          <p className="text-xs text-slate-400 py-8 text-center">{t.empty}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs text-slate-500">
                  <th className="text-start py-2 font-semibold">{t.teacher}</th>
                  <th className="text-start py-2 font-semibold">{t.balance}</th>
                  <th className="text-start py-2 font-semibold">{t.frozen}</th>
                  <th className="text-start py-2 font-semibold">{t.available}</th>
                  <th className="text-start py-2 font-semibold">{t.entries}</th>
                </tr>
              </thead>
              <tbody>
                {data.wallets.map((row) => (
                  <tr key={row.teacher_id} className="border-b border-slate-50">
                    <td className="py-2 font-medium text-slate-800">{row.teacher_name}</td>
                    <td className="py-2 text-slate-600">{row.balance}</td>
                    <td className="py-2 text-amber-600">{row.frozen_balance}</td>
                    <td className="py-2 text-emerald-600">{row.available}</td>
                    <td className="py-2 text-slate-500">{row.entry_count}</td>
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
