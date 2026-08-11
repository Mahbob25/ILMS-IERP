"use client";

import React, { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Search, Loader2 } from "lucide-react";
import { searchGrouped, GroupedSearchResponse } from "@/lib/search";

const TYPE_LABELS: Record<string, { ar: string; en: string }> = {
  students: { ar: "الطلاب", en: "Students" },
  courses: { ar: "المقررات", en: "Courses" },
  sections: { ar: "الشعب", en: "Sections" },
  enrollments: { ar: "التسجيلات", en: "Enrollments" },
  payments: { ar: "المدفوعات", en: "Payments" },
  expenses: { ar: "المصروفات", en: "Expenses" },
};

export default function GlobalSearch() {
  const params = useParams();
  const router = useRouter();
  const locale = (params?.locale as string) || "ar";
  const isRtl = locale === "ar";
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<GroupedSearchResponse | null>(null);
  const [highlight, setHighlight] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const placeholder = isRtl ? "بحث..." : "Search...";
  const emptyText = isRtl ? "لا توجد نتائج" : "No results";
  const hintText = isRtl ? "اكتب حرفين على الأقل" : "Type at least 2 characters";

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setData(null);
      setOpen(q.length > 0);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await searchGrouped(q, locale, 5);
        if (!cancelled) {
          setData(res);
          setOpen(true);
          setHighlight(0);
        }
      } catch {
        if (!cancelled) setData(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, locale]);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const allHits = data ? Object.entries(data.results).flatMap(([type, hits]) => hits.map((h) => ({ ...h, groupType: type }))) : [];

  const navigateTo = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  const onInputKeyDown = (e: React.KeyboardEvent) => {
    if (!open || allHits.length === 0) {
      if (e.key === "Enter" && query.trim().length >= 2) {
        router.push(`/${locale}/dashboard/search?q=${encodeURIComponent(query.trim())}`);
        setOpen(false);
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => (h + 1) % allHits.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => (h - 1 + allHits.length) % allHits.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const hit = allHits[highlight];
      if (hit) navigateTo(hit.href);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={containerRef} className="relative w-full max-w-[280px] hidden md:block">
      <div className="relative">
        <Search size={14} className={`absolute top-1/2 -translate-y-1/2 text-slate-400 ${isRtl ? "right-3" : "left-3"}`} />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => query.trim().length >= 1 && setOpen(true)}
          onKeyDown={onInputKeyDown}
          placeholder={placeholder}
          dir={isRtl ? "rtl" : "ltr"}
          className={`w-full text-sm py-1.5 rounded-lg bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 ${isRtl ? "pr-8 pl-3" : "pl-8 pr-3"}`}
        />
        {loading && <Loader2 size={14} className="absolute top-1/2 -translate-y-1/2 right-2 animate-spin text-slate-400 md:right-auto md:left-auto" style={isRtl ? { left: 8 } : { right: 8 }} />}
      </div>

      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden max-h-[380px] overflow-y-auto">
          {query.trim().length < 2 ? (
            <p className="px-3 py-3 text-xs text-slate-500">{hintText}</p>
          ) : data && allHits.length === 0 ? (
            <p className="px-3 py-3 text-xs text-slate-500">{emptyText}</p>
          ) : data ? (
            <>
              {Object.entries(data.results).map(([type, hits]) => (
                <div key={type} className="border-b border-slate-100 last:border-0">
                  <p className="px-3 py-1.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider bg-slate-50">
                    {TYPE_LABELS[type]?.[locale === "en" ? "en" : "ar"] || type} ({hits.length})
                  </p>
                  <ul>
                    {hits.map((h) => {
                      const flatIdx = allHits.findIndex((x) => x.id === h.id && x.type === h.type);
                      const active = flatIdx === highlight;
                      return (
                        <li
                          key={`${h.type}-${h.id}`}
                          onClick={() => navigateTo(h.href)}
                          onMouseEnter={() => setHighlight(flatIdx)}
                          className={`px-3 py-2 text-sm cursor-pointer flex flex-col ${active ? "bg-brand-50 text-brand-700" : "text-slate-700 hover:bg-slate-50"}`}
                        >
                          <span className="font-medium truncate">{h.label}</span>
                          {h.sublabel && <span className="text-xs text-slate-500 truncate">{h.sublabel}</span>}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
              <button
                onClick={() => {
                  router.push(`/${locale}/dashboard/search?q=${encodeURIComponent(query.trim())}`);
                  setOpen(false);
                }}
                className="w-full px-3 py-2 text-xs font-medium text-brand-600 hover:bg-slate-50 border-t border-slate-200"
              >
                {isRtl ? "عرض كل النتائج" : "View all results"} →
              </button>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
