"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiClient } from "@/lib/api";

type Row = { id: string; name: string; phone: string; message: string | null; locale: string; status: string; created_at: string; contacted_at: string | null; notes: string | null };

export default function ContactsPage() {
  const params = useParams();
  const locale = (params?.locale as string) === "en" ? "en" : "ar";
  const isAr = locale === "ar";
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const perPage = 20;
  const t = isAr ? { title: "رسائل التواصل", sub: "رسائل من نموذج التواصل في الموقع", searchPh: "بحث بالاسم أو الهاتف", all: "الكل", pending: "قيد الانتظار", contacted: "تم التواصل", archived: "مؤرشف", markContacted: "تم التواصل", archive: "أرشفة", phone: "الهاتف", date: "التاريخ", statusL: "الحالة", actions: "إجراءات", prev: "السابق", next: "التالي", empty: "لا توجد رسائل." } : { title: "Contacts", sub: "Messages from the landing contact form", searchPh: "Search name or phone", all: "All", pending: "Pending", contacted: "Contacted", archived: "Archived", markContacted: "Mark contacted", archive: "Archive", phone: "Phone", date: "Date", statusL: "Status", actions: "Actions", prev: "Prev", next: "Next", empty: "No messages." };

  async function load() {
    setLoading(true);
    try {
      const res = await apiClient.get("/contacts", { params: { status: status || undefined, search: search || undefined, page, per_page: perPage } });
      setRows(res.data.items || []);
      setTotal(res.data.total || 0);
    } catch { setRows([]); }
    setLoading(false);
  }
  useEffect(() => { load(); }, [status, page]); // eslint-disable-line
  useEffect(() => { const id = setTimeout(() => { setPage(1); load(); }, 400); return () => clearTimeout(id); }, [search]); // eslint-disable-line

  async function patch(id: string, s: string) {
    try { await apiClient.patch(`/contacts/${id}`, { status: s }); load(); } catch {}
  }
  const pages = Math.max(1, Math.ceil(total / perPage));
  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div><h1 className="text-xl font-bold tracking-tight">{t.title}</h1><p className="text-sm text-slate-500">{t.sub} — {total}</p></div>
      <div className="flex flex-wrap gap-2 items-center bg-white border border-slate-200 rounded-xl p-3">
        <div className="flex gap-1 p-1 rounded-full bg-slate-100 border border-slate-200">
          {[["", t.all], ["pending", t.pending], ["contacted", t.contacted], ["archived", t.archived]].map(([v, label]) => (
            <button key={v || "all"} onClick={() => { setStatus(v); setPage(1); }} className={`px-3 py-1.5 rounded-full text-xs font-semibold ${status === v ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-white"}`}>{label}</button>
          ))}
        </div>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t.searchPh} className="ms-auto min-w-[200px] h-9 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:bg-white" />
      </div>
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs">
              <tr><th className="text-start px-3 py-2">{t.phone}</th><th className="text-start px-3 py-2">{t.date}</th><th className="text-start px-3 py-2">{t.statusL}</th><th className="text-start px-3 py-2">{t.actions}</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50/60">
                  <td className="px-3 py-2"><div className="font-semibold">{r.name}</div><div className="text-xs text-slate-500" dir="ltr">{r.phone}</div>{r.message && <div className="text-xs text-slate-500 mt-0.5 line-clamp-2">{r.message}</div>}</td>
                  <td className="px-3 py-2 text-xs text-slate-600">{new Date(r.created_at).toLocaleString(locale === "ar" ? "ar-EG" : "en-GB")}</td>
                  <td className="px-3 py-2"><span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-bold border ${r.status === "pending" ? "bg-amber-50 border-amber-200 text-amber-700" : r.status === "contacted" ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-slate-100 border-slate-200 text-slate-600"}`}>{r.status}</span></td>
                  <td className="px-3 py-2"><div className="flex gap-1.5 flex-wrap">{r.status === "pending" && <><button onClick={() => patch(r.id, "contacted")} className="px-2.5 py-1 rounded-full bg-slate-900 text-white text-xs font-semibold">{t.markContacted}</button><button onClick={() => patch(r.id, "archived")} className="px-2.5 py-1 rounded-full bg-white border border-slate-200 text-xs font-semibold">{t.archive}</button></>}{r.status === "contacted" && <button onClick={() => patch(r.id, "archived")} className="px-2.5 py-1 rounded-full bg-white border border-slate-200 text-xs font-semibold">{t.archive}</button>}</div></td>
                </tr>
              ))}
              {!loading && rows.length === 0 && <tr><td colSpan={4} className="px-3 py-10 text-center text-sm text-slate-400">{t.empty}</td></tr>}
            </tbody>
          </table>
        </div>
        {pages > 1 && <div className="flex items-center justify-between px-3 py-2 border-t border-slate-200 text-sm"><button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white disabled:opacity-40">{t.prev}</button><span className="text-xs text-slate-500">{page} / {pages}</span><button disabled={page >= pages} onClick={() => setPage((p) => p + 1)} className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white disabled:opacity-40">{t.next}</button></div>}
      </div>
    </div>
  );
}
