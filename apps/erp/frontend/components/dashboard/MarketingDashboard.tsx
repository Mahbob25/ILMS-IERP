"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiClient } from "@/lib/api";
import { LayoutDashboard, Megaphone, Mail, Calendar, ArrowUpRight } from "lucide-react";

export default function MarketingDashboard() {
  const params = useParams();
  const router = useRouter();
  const locale = (params?.locale as string) || "ar";
  const isAr = locale === "ar";
  const t = isAr
    ? { title: "لوحة التسويق", sub: "إدارة محتوى الموقع والإعلانات والتواصل", cards: [
        { k: "محتوى الموقع", d: "تعديل النصوص بالعربية والإنجليزية", href: "content", icon: LayoutDashboard },
        { k: "الإعلانات", d: "نصوص الشريط المتحرك", href: "announcements", icon: Megaphone },
        { k: "رسائل التواصل", d: "الرسائل الواردة من الموقع", href: "contacts", icon: Mail },
        { k: "الحجوزات", d: "حجوزات الحصص التجريبية", href: "bookings", icon: Calendar },
      ]}
    : { title: "Marketing", sub: "Landing content, announcements & inbox", cards: [
        { k: "Landing Content", d: "Edit AR/EN copy", href: "content", icon: LayoutDashboard },
        { k: "Announcements", d: "Ticker texts", href: "announcements", icon: Megaphone },
        { k: "Contacts", d: "Inbound messages", href: "contacts", icon: Mail },
        { k: "Bookings", d: "Trial bookings", href: "bookings", icon: Calendar },
      ]};
  const [counts, setCounts] = useState<{ contacts: number; bookings: number; announcements: number } | null>(null);
  useEffect(() => {
    Promise.all([
      apiClient.get("/contacts", { params: { per_page: 1 } }).then((r) => r.data?.total ?? 0).catch(() => 0),
      apiClient.get("/bookings", { params: { per_page: 1 } }).then((r) => r.data?.total ?? 0).catch(() => 0),
      apiClient.get("/announcements").then((r) => Array.isArray(r.data) ? r.data.length : 0).catch(() => 0),
    ]).then(([contacts, bookings, announcements]) => setCounts({ contacts, bookings, announcements }));
  }, []);
  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div><h1 className="text-xl font-bold tracking-tight">{t.title}</h1><p className="text-sm text-slate-500">{t.sub}</p></div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {t.cards.map((c) => {
          const Icon = c.icon;
          const count = c.href === "contacts" ? counts?.contacts : c.href === "bookings" ? counts?.bookings : c.href === "announcements" ? counts?.announcements : undefined;
          return (
            <button key={c.href} onClick={() => router.push(`/${locale}/dashboard/${c.href}`)} className="card p-5 flex items-center gap-4 text-start hover:border-slate-300 transition">
              <span className="w-11 h-11 rounded-xl bg-slate-900 text-white grid place-items-center shrink-0"><Icon size={20} /></span>
              <span className="flex-1 min-w-0"><span className="block text-sm font-bold text-slate-900 flex items-center gap-1.5">{c.k} <ArrowUpRight size={14} className="opacity-40" /></span><span className="block text-xs text-slate-500">{c.d}</span>{count !== undefined && <span className="inline-flex mt-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200">{count}</span>}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
