"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Loader2, Search } from "lucide-react";
import { searchGrouped, GroupedSearchResponse, SearchHit } from "@/lib/search";

const TABS = ["all", "students", "courses", "sections", "enrollments", "payments", "expenses"] as const;

export default function SearchPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const locale = (params?.locale as string) || "ar";
  const isRtl = locale === "ar";
  const q = searchParams.get("q") || "";
  const [input, setInput] = useState(q);
  const [tab, setTab] = useState<(typeof TABS)[number]>("all");
  const [data, setData] = useState<GroupedSearchResponse | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => { setInput(q); }, [q]);

  useEffect(() => {
    if (q.trim().length < 2) {
      setData(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    searchGrouped(q.trim(), locale, 15)
      .then((res) => { if (!cancelled) setData(res); })
      .catch(() => { if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [q, locale]);

  const submit = (val: string) => {
    const trimmed = val.trim();
    if (trimmed.length >= 2) router.push(`/${locale}/dashboard/search?q=${encodeURIComponent(trimmed)}`);
  };

  const visibleHits: SearchHit[] = (() => {
    if (!data) return [];
    if (tab === "all") return Object.values(data.results).flat();
    return data.results[tab] || [];
  })();

  return (
    <div className="max-w-5xl mx-auto space-y-6" dir={isRtl ? "rtl" : "ltr"}>
      <div>
        <h2 className="text-xl font-bold text-slate-900">{isRtl ? "البحث المتقدم" : "Global Search"}</h2>
        <p className="text-sm text-slate-500 mt-1">{isRtl ? "ابحث عبر الطلاب والمقررات والشعب والمدفوعات" : "Search across students, courses, sections, payments"}</p>
      </div>

      <div className="card p-4">
        <div className="relative max-w-xl">
          <Search size={16} className={`absolute top-1/2 -translate-y-1/2 text-slate-400 ${isRtl ? "right-3" : "left-3"}`} />
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submit(input); }}
            placeholder={isRtl ? "اكتب كلمة البحث..." : "Type to search..."}
            dir={isRtl ? "rtl" : "ltr"}
            className={`w-full input-field ${isRtl ? "pr-9" : "pl-9"}`}
          />
        </div>
      </div>

      {q.trim().length >= 2 && (
        <div className="flex gap-2 flex-wrap">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border ${tab === t ? "bg-brand-600 text-white border-brand-600" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}
            >
              {t === "all" ? (isRtl ? "الكل" : "All") : t}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="animate-spin text-slate-400" size={24} /></div>
      ) : !q || q.trim().length < 2 ? (
        <p className="text-sm text-slate-500 text-center py-8">{isRtl ? "اكتب حرفين على الأقل للبحث" : "Type at least 2 characters"}</p>
      ) : !data || visibleHits.length === 0 ? (
        <p className="text-sm text-slate-500 text-center py-8">{isRtl ? "لا توجد نتائج" : "No results"}</p>
      ) : (
        <div className="card overflow-hidden">
          <ul className="divide-y divide-slate-100">
            {visibleHits.map((h) => (
              <li key={`${h.type}-${h.id}`} onClick={() => router.push(h.href)} className="px-4 py-3 hover:bg-slate-50 cursor-pointer flex flex-col gap-0.5">
                <span className="text-sm font-medium text-slate-900">{h.label}</span>
                {h.sublabel && <span className="text-xs text-slate-500">{h.sublabel}</span>}
                <span className="text-[11px] text-slate-400 uppercase">{h.type}</span>
              </li>
            ))}
          </ul>
          <p className="px-4 py-2 text-xs text-slate-400 border-t border-slate-100">{isRtl ? "الإجمالي" : "Total"}: {data.total}</p>
        </div>
      )}
    </div>
  );
}
