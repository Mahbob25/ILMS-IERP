"use client";

import React, { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { apiClient } from "@/lib/api";
import { useAuth } from "@/components/AuthContext";
import { useLinkedStudents } from "@/components/useLinkedStudents";
import { prepareImageFile } from "@/lib/image";
import { Settings, Bell, Loader2, KeyRound, Globe, Camera } from "lucide-react";
import { useRouter } from "next/navigation";

const t = {
  ar: {
    title: "الإعدادات",
    subtitle: "تفضيلات البوابة",
    notification: "الإشعارات مفعلة (قريبًا)",
    language: "اللغة",
    languageHint: "اختر لغة البوابة",
    arabic: "العربية",
    english: "English",
    saving: "جاري الحفظ...",
    saved: "تم حفظ التفضيلات",
    failed: "تعذر الحفظ. حاول مرة أخرى.",
    noStudent: "لا يوجد طالب مرتبط لحفظ التفضيلات.",
    changePassword: "تغيير كلمة المرور",
    currentPassword: "كلمة المرور الحالية",
    newPassword: "كلمة المرور الجديدة",
    confirmPassword: "تأكيد كلمة المرور الجديدة",
    passwordsMismatch: "كلمتا المرور غير متطابقتين",
    passwordMin: "كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل",
    passwordUpdated: "تم تحديث كلمة المرور بنجاح",
    passwordFailed: "تعذر تحديث كلمة المرور",
    updatePassword: "تحديث كلمة المرور",
    photoTitle: "الصورة الشخصية",
    photoHint: "JPG أو PNG أو WebP — حتى 5 ميجابايت",
    changePhoto: "تغيير الصورة",
    uploading: "جاري الرفع...",
    photoUpdated: "تم تحديث الصورة",
    photoFailed: "تعذر رفع الصورة",
    noPhotoStudent: "لا يوجد طالب مرتبط لتحديث الصورة.",
  },
  en: {
    title: "Settings",
    subtitle: "Portal preferences",
    notification: "Notifications enabled (coming soon)",
    language: "Language",
    languageHint: "Choose the portal language",
    arabic: "العربية",
    english: "English",
    saving: "Saving...",
    saved: "Preferences saved",
    failed: "Could not save. Please try again.",
    noStudent: "No linked student to save preferences for.",
    changePassword: "Change Password",
    currentPassword: "Current Password",
    newPassword: "New Password",
    confirmPassword: "Confirm New Password",
    passwordsMismatch: "Passwords do not match",
    passwordMin: "New password must be at least 8 characters",
    passwordUpdated: "Password updated successfully",
    passwordFailed: "Could not update password",
    updatePassword: "Update Password",
    photoTitle: "Profile photo",
    photoHint: "JPG, PNG or WebP — up to 5MB",
    changePhoto: "Change photo",
    uploading: "Uploading...",
    photoUpdated: "Photo updated",
    photoFailed: "Could not upload the photo",
    noPhotoStudent: "No linked student to update the photo for.",
  },
};

export default function SettingsPage() {
  const router = useRouter();
  const params = useParams();
  const locale = (params?.locale as string) === "en" ? "en" : "ar";
  const s = t[locale];
  const { user } = useAuth();
  const { selectedId, selectedStudent, refresh } = useLinkedStudents(locale);

  const [notifEnabled, setNotifEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [pwCurrent, setPwCurrent] = useState("");
  const [pwNew, setPwNew] = useState("");
  const [pwConfirm, setPwConfirm] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMessage, setPwMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const photoInputRef = useRef<HTMLInputElement>(null);
  const [photoSaving, setPhotoSaving] = useState(false);
  const [photoMessage, setPhotoMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0];
    // Reset first so re-picking the same file after a failure still fires onChange.
    e.target.value = "";
    if (!picked) return;

    if (!selectedId) {
      setPhotoMessage({ type: "error", text: s.noPhotoStudent });
      return;
    }

    setPhotoSaving(true);
    setPhotoMessage(null);
    try {
      const file = await prepareImageFile(picked);
      const form = new FormData();
      form.append("file", file);
      // Explicit multipart: the client defaults to application/json, which
      // would make axios serialise the FormData into JSON.
      await apiClient.post("/me/photo", form, {
        params: { student_id: selectedId },
        headers: { "Content-Type": "multipart/form-data" },
      });
      // The header and hero card read the photo from the cached /me payload.
      await refresh();
      setPhotoMessage({ type: "success", text: s.photoUpdated });
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      setPhotoMessage({ type: "error", text: detail || s.photoFailed });
    } finally {
      setPhotoSaving(false);
    }
  };

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

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwMessage(null);
    if (pwNew.length < 8) {
      setPwMessage({ type: "error", text: s.passwordMin });
      return;
    }
    if (pwNew !== pwConfirm) {
      setPwMessage({ type: "error", text: s.passwordsMismatch });
      return;
    }
    setPwSaving(true);
    try {
      await apiClient.post("/auth/change-password", {
        current_password: pwCurrent,
        new_password: pwNew,
      });
      setPwCurrent("");
      setPwNew("");
      setPwConfirm("");
      setPwMessage({ type: "success", text: s.passwordUpdated });
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      setPwMessage({ type: "error", text: detail || s.passwordFailed });
    } finally {
      setPwSaving(false);
    }
  };

  const photoInitials = (() => {
    const parts = (selectedStudent?.full_name || "").trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "؟";
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  })();

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
          <Settings className="text-brand-600" size={24} />
          {s.title}
        </h1>
        <p className="text-sm text-slate-500 mt-1">{s.subtitle}</p>
      </div>

      {/* Profile photo — the student's record, which is what the portal shows. */}
      <div className="card p-5">
        <div className="flex items-center gap-4">
          {selectedStudent?.photo_url ? (
            <img
              src={selectedStudent.photo_url}
              alt={selectedStudent.full_name}
              className="w-20 h-20 rounded-2xl object-cover border border-slate-200 shrink-0"
            />
          ) : (
            <div
              aria-hidden="true"
              className="w-20 h-20 rounded-2xl bg-brand-50 text-brand-700 border border-brand-100 text-xl font-bold flex items-center justify-center shrink-0"
            >
              {photoInitials}
            </div>
          )}

          <div className="min-w-0 space-y-2">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                <Camera className="text-brand-600" size={18} />
                {s.photoTitle}
              </h2>
              <p className="text-xs text-slate-500 mt-1">{s.photoHint}</p>
            </div>

            <input
              ref={photoInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handlePhotoChange}
            />
            <button
              type="button"
              onClick={() => photoInputRef.current?.click()}
              disabled={photoSaving || !selectedId}
              className="btn-touch px-4 py-2 rounded-xl border text-sm font-semibold bg-white text-slate-700 border-slate-200 hover:bg-slate-50 disabled:opacity-50 inline-flex items-center gap-2"
            >
              {photoSaving && <Loader2 size={14} className="animate-spin" />}
              {photoSaving ? s.uploading : s.changePhoto}
            </button>

            {photoMessage && (
              <p
                className={`text-xs font-medium ${
                  photoMessage.type === "success" ? "text-emerald-600" : "text-rose-600"
                }`}
              >
                {photoMessage.text}
              </p>
            )}
          </div>
        </div>
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

      {/* Language preference */}
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-3">
          <Globe className="text-brand-600" size={18} />
          <h2 className="text-sm font-semibold text-slate-900">{s.language}</h2>
          <p className="text-xs text-slate-500 ms-1">{s.languageHint}</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {(
            [
              { value: "ar" as const, label: s.arabic },
              { value: "en" as const, label: s.english },
            ]
          ).map((lang) => {
            const active = locale === lang.value;
            return (
              <button
                key={lang.value}
                type="button"
                onClick={() => {
                  if (!active) router.push(`/${lang.value}/dashboard/settings`);
                }}
                aria-pressed={active}
                className={`btn-touch justify-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-semibold transition-all duration-150 ${
                  active
                    ? "bg-brand-50 text-brand-600 border-brand-200"
                    : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                }`}
              >
                {lang.label}
                {active && <span className="w-1.5 h-1.5 rounded-full bg-brand-600" />}
              </button>
            );
          })}
        </div>
      </div>

      <form onSubmit={handleChangePassword} className="card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <KeyRound className="text-brand-600" size={18} />
          <h2 className="text-sm font-semibold text-slate-900">{s.changePassword}</h2>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">
            {s.currentPassword}
          </label>
          <input
            type="password"
            value={pwCurrent}
            onChange={(e) => setPwCurrent(e.target.value)}
            className="input-field"
            dir="ltr"
            required
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              {s.newPassword}
            </label>
            <input
              type="password"
              value={pwNew}
              onChange={(e) => setPwNew(e.target.value)}
              className="input-field"
              dir="ltr"
              minLength={8}
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              {s.confirmPassword}
            </label>
            <input
              type="password"
              value={pwConfirm}
              onChange={(e) => setPwConfirm(e.target.value)}
              className="input-field"
              dir="ltr"
              minLength={8}
              required
            />
          </div>
        </div>

        {pwMessage && (
          <p className={`text-xs font-medium ${pwMessage.type === "success" ? "text-emerald-600" : "text-rose-600"}`}>
            {pwMessage.text}
          </p>
        )}

        <button
          type="submit"
          disabled={pwSaving}
          className="btn-primary text-sm flex items-center gap-2 disabled:opacity-50"
        >
          {pwSaving && <Loader2 size={14} className="animate-spin" />}
          {s.updatePassword}
        </button>
      </form>

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
