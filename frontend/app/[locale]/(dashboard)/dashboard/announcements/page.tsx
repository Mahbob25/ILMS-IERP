"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiClient } from "@/lib/api";

type Row = { id: string; text_ar: string; text_en: string; is_active: boolean; sort_order: number; created_at: string };

export default function AnnouncementsPage() {
  const params = useParams();
  const isAr = (params?.locale as string) !== "en";
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ text_ar: "", text_en: "", is_active: true, sort_order: 0 });
  const [editing, setEditing] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await apiClient.get("/announcements");
      setRows(res.data || []);
    } catch { setRows([]); }
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function submit() {
    if (!form.text_ar.trim() || !form.text_en.trim()) return;
    try {
      if (editing) {
        await apiClient.patch(`/announcements/${editing}`, form);
      } else {
        await apiClient.post("/announcements", form);
      }
      setForm({ text_ar: "", text_en: "", is_active: true, sort_order: 0 });
      setEditing(null);
      load();
    } catch {}
  }
  async function del(id: string) {
    await apiClient.delete(`/announcements/${id}`);
    load();
  }
  function startEdit(r: Row) {
    setEditing(r.id);
    setForm({ text_ar: r.text_ar, text_en: r.text_en, is_active: r.is_active, sort_order: r.sort_order });
  }

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight">{isAr ? "الإعلانات" : "Announcements"}</h1>
        <p className="text-sm text-slate-500">{isAr ? "نصوص الشريط المتحرك في الصفحة الرئيسية" : "Ticker texts shown on the landing page tape"}</p>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <input placeholder="text_ar" value={form.text_ar} onChange={(e) => setForm({ ...form, text_ar: e.target.value })} className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:bg-white" />
          <input placeholder="text_en" value={form.text_en} onChange={(e) => setForm({ ...form, text_en: e.target.value })} className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:bg-white" />
        </div>
        <div className="flex flex-wrap gap-3 items-center">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} /> {isAr ? "نشط" : "Active"}</label>
          <input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })} className="w-24 h-9 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm" placeholder="order" />
          <button onClick={submit} className="px-5 py-2 rounded-full bg-slate-900 text-white text-sm font-bold">{editing ? (isAr ? "تحديث" : "Update") : (isAr ? "إضافة" : "Add")}</button>
          {editing && <button onClick={() => { setEditing(null); setForm({ text_ar: "", text_en: "", is_active: true, sort_order: 0 }); }} className="px-4 py-2 rounded-full bg-white border border-slate-200 text-sm">{isAr ? "إلغاء" : "Cancel"}</button>}
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs">
              <tr><th className="text-start px-3 py-2">AR</th><th className="text-start px-3 py-2">EN</th><th className="text-start px-3 py-2">{isAr ? "الحالة" : "Status"}</th><th className="text-start px-3 py-2">#</th><th className="text-start px-3 py-2">{isAr ? "إجراءات" : "Actions"}</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50/60">
                  <td className="px-3 py-2">{r.text_ar}</td>
                  <td className="px-3 py-2">{r.text_en}</td>
                  <td className="px-3 py-2"><span className={`px-2 py-0.5 rounded-full text-[11px] font-bold border ${r.is_active ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-slate-100 border-slate-200 text-slate-600"}`}>{r.is_active ? (isAr ? "نشط" : "Active") : (isAr ? "متوقف" : "Off")}</span></td>
                  <td className="px-3 py-2 text-xs">{r.sort_order}</td>
                  <td className="px-3 py-2 flex gap-1.5">
                    <button onClick={() => startEdit(r)} className="px-3 py-1 rounded-full bg-white border border-slate-200 text-xs font-semibold">{isAr ? "تعديل" : "Edit"}</button>
                    <button onClick={() => del(r.id)} className="px-3 py-1 rounded-full bg-red-50 border border-red-200 text-red-600 text-xs font-semibold">{isAr ? "حذف" : "Delete"}</button>
                  </td>
                </tr>
              ))}
              {!loading && rows.length === 0 && <tr><td colSpan={5} className="px-3 py-10 text-center text-sm text-slate-400">{isAr ? "لا توجد إعلانات" : "No announcements"}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
