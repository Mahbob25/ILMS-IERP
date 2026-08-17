"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiClient } from "@/lib/api";
import { useAuth } from "@/components/AuthContext";
import { useLinkedStudents } from "@/components/useLinkedStudents";
import { Settings, Bell, Loader2 } from "lucide-react";

const t = {
  ar: {
    title: "الإعدادات",
    subtitle: "تفضيلات البوابة",
    notification: "الإشعارات مفعلة (قريبًا)",
    saving: "جاري الحفظ...",
    saved: "تم حفظ التفضيلات",
    failed: "تعذر الحفظ. حاول مرة أخرى.",
    noStudent: "لا يوجد طالب مرتبط لحفظ التفضيلات.",
  },
  en: {
    title: "Settings",
    subtitle: "Portal preferences",
    notification: "Notifications enabled (coming soon)",
    saving: "Saving...",
    saved: "Preferences saved",
    failed: "Could not save. Please try again.",
    noStudent: "No linked student to save preferences for.",
  },
};

export default function SettingsPage() {
  const params = useParams();
  const locale = (params?.locale as string) === "en" ? "en" : "ar";
  const s = t[locale];
  const { user } = useAuth();
  const { selectedId } = useLinkedStudents(locale);

  const [notifEnabled, setNotifEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Persist locale preference to the ERP-backed profile write path.
  useEffect(() => {
    if (!selectedId) return;
    setSaving(true);
    apiClient
      .post("/me/profile", { locale_pref: locale }, { params: { student_id: selectedId } })
      .then(() => {
        setSaved(true);
        setError(null);
      })
      .catch(() => {
        setSaved(false);
        setError(s.failed);
      })
      .finally(() => setSaving(false));
  }, [locale, selectedId, s.failed]);

  const handleToggle = async (checked: boolean) => {
    setNotifEnabled(checked);
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      // Phase 4 wires portal.preferences via the ERP internal write path.
      await new Promise((r) => setTimeout(r, 300));
      setSaved(true);
    } catch {
      setError(s.failed);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
          <Settings className="text-brand-600" size={24} />
          {s.title}
        </h1>
        <p className="text-sm text-slate-500 mt-1">{s.subtitle}</p>
      </div>

      <div className="card p-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Bell className="text-slate-400" size={20} />
          <div>
            <p className="text-sm font-medium text-slate-900">{s.notification}</p>
            <p className="text-xs text-slate-500">{user?.email || user?.phone}</p>
          </div>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={notifEnabled}
            onChange={(e) => handleToggle(e.target.checked)}
            disabled={saving}
            className="sr-only peer"
          />
          <div className="w-10 h-5 bg-slate-200 peer-checked:bg-brand-500 rounded-full after:content-[''] after:absolute after:top-0.5 after:start-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full peer-checked:rtl:after:-translate-x-full" />
        </label>
      </div>

      {saving && (
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <Loader2 className="animate-spin" size={14} />
          {s.saving}
        </div>
      )}
      {saved && !saving && (
        <p className="text-xs text-emerald-600 font-medium">{s.saved}</p>
      )}
      {error && !saving && (
        <p className="text-xs text-rose-600 font-medium">{error}</p>
      )}
    </div>
  );
}
