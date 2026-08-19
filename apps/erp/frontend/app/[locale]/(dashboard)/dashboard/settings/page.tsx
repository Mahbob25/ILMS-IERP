"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthContext";
import { apiClient } from "@/lib/api";
import {
  User as UserIcon,
  ShieldCheck,
  Lock,
  Languages,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Building2,
} from "lucide-react";
import { BrandLogo } from "@/components/ui/BrandLogo";

type TabKey = "profile" | "security" | "preferences" | "system";

export default function SettingsPage() {
  const params = useParams();
  const router = useRouter();
  const locale = (params?.locale as string) || "ar";
  const isRtl = locale === "ar";
  const { user, checkSession } = useAuth();
  const [tab, setTab] = useState<TabKey>("profile");

  const t = {
    ar: {
      title: "الإعدادات",
      subtitle: "إدارة حسابك وتفضيلاتك",
      tabs: { profile: "الملف الشخصي", security: "الأمان", preferences: "التفضيلات" },
      profile: {
        heading: "الملف الشخصي",
        email: "البريد الإلكتروني",
        emailHint: "البريد للعرض فقط — التعديل عبر إدارة المستخدمين",
        fullName: "الاسم الكامل",
        role: "الدور",
        status: "الحالة",
        active: "نشط",
        inactive: "غير نشط",
        superadmin: "مدير خارق",
        locale: "اللغة",
        loading: "جاري التحميل...",
      },
      security: {
        heading: "تغيير كلمة المرور",
        current: "كلمة المرور الحالية",
        newPass: "كلمة المرور الجديدة",
        confirm: "تأكيد كلمة المرور",
        submit: "تحديث كلمة المرور",
        success: "تم تحديث كلمة المرور بنجاح",
        mismatch: "كلمتا المرور غير متطابقتين",
        required: "هذا الحقل مطلوب",
        weak: "كلمة المرور ضعيفة — يجب أن تحتوي على حرف كبير وصغير ورقم ورمز خاص (8 أحرف على الأقل)",
      },
      prefs: {
        heading: "التفضيلات",
        language: "اللغة",
        languageHint: "سيتم تحديث الواجهة بعد الحفظ",
        save: "حفظ",
        saved: "تم الحفظ",
        comingSoon: "قريباً",
        notificationsTitle: "الإشعارات",
        notificationsHint: "إعدادات الإشعارات ستتوفر قريباً",
      },
      system: {
        heading: "إعدادات النظام",
        headingHint: "متاح لمدير النظام فقط",
        institute: "بيانات المعهد",
        name: "اسم المعهد",
        address: "العنوان",
        phone: "الهاتف",
        logo: "الشعار",
        logoComingSoon: "تعديل الشعار قريباً",
        defaults: "الإعدادات الافتراضية",
        timezone: "المنطقة الزمنية",
        teacherPct: "نسبة المعلم الافتراضية (%)",
        backupRetention: "الاحتفاظ بالنسخ الاحتياطي (أيام)",
        save: "حفظ",
        saved: "تم حفظ إعدادات النظام",
      },
      common: { save: "حفظ", saving: "جاري الحفظ...", error: "حدث خطأ، حاول مرة أخرى" },
    },
    en: {
      title: "Settings",
      subtitle: "Manage your account and preferences",
      tabs: { profile: "Profile", security: "Security", preferences: "Preferences" },
      profile: {
        heading: "Profile",
        email: "Email",
        emailHint: "Read-only — edit via User Management",
        fullName: "Full name",
        role: "Role",
        status: "Status",
        active: "Active",
        inactive: "Inactive",
        superadmin: "Superadmin",
        locale: "Language",
        loading: "Loading...",
      },
      security: {
        heading: "Change password",
        current: "Current password",
        newPass: "New password",
        confirm: "Confirm new password",
        submit: "Update password",
        success: "Password updated successfully",
        mismatch: "Passwords do not match",
        required: "This field is required",
        weak: "Weak password — must include upper, lower, digit, special char (min 8)",
      },
      prefs: {
        heading: "Preferences",
        language: "Language",
        languageHint: "Interface will update after save",
        save: "Save",
        saved: "Saved",
        comingSoon: "Coming soon",
        notificationsTitle: "Notifications",
        notificationsHint: "Notification settings coming soon",
      },
      system: {
        heading: "System settings",
        headingHint: "Superadmin only",
        institute: "Institute profile",
        name: "Institute name",
        address: "Address",
        phone: "Phone",
        logo: "Logo",
        logoComingSoon: "Logo editing — Coming soon",
        defaults: "Runtime defaults",
        timezone: "Timezone",
        teacherPct: "Default teacher percentage (%)",
        backupRetention: "Backup retention (days)",
        save: "Save",
        saved: "System settings saved",
      },
      common: { save: "Save", saving: "Saving...", error: "Something went wrong, try again" },
    },
  }[locale === "en" ? "en" : "ar"];

  const dir = isRtl ? "rtl" : "ltr";

  const [meLoading, setMeLoading] = useState(true);
  const [meError, setMeError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setMeError(null);
        await checkSession();
      } catch {
        if (!cancelled) setMeError(t.common.error);
      } finally {
        if (!cancelled) setMeLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const roleLabel = (() => {
    if (!user) return "—";
    if (user.is_superadmin) return t.profile.superadmin;
    const map: Record<string, string> = {
      superadmin: t.profile.superadmin,
      manager: locale === "ar" ? "مسؤول النظام" : "Manager",
      secretary: locale === "ar" ? "سكرتير" : "Secretary",
      teacher: locale === "ar" ? "معلم" : "Teacher",
    };
    return map[user.role?.name] || user.role?.name || "—";
  })();

  const [localePref, setLocalePref] = useState<string>(user?.locale_pref || locale);
  const [prefsSaving, setPrefsSaving] = useState(false);
  const [prefsMsg, setPrefsMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    if (user?.locale_pref) setLocalePref(user.locale_pref);
  }, [user?.locale_pref]);

  const handleSavePrefs = useCallback(async () => {
    setPrefsSaving(true);
    setPrefsMsg(null);
    try {
      await apiClient.patch("/users/me", { locale_pref: localePref });
      await checkSession();
      setPrefsMsg({ kind: "ok", text: t.prefs.saved });
      if (localePref !== locale) {
        const pathname = window.location.pathname;
        const nextPath = pathname.replace(`/${locale}`, `/${localePref}`);
        router.push(nextPath);
      }
    } catch (e: any) {
      const detail = e?.response?.data?.detail || e?.message || t.common.error;
      const msg = Array.isArray(detail) ? detail.map((d: any) => d.msg || d.detail || JSON.stringify(d)).join(" · ") : String(detail);
      setPrefsMsg({ kind: "err", text: msg });
    } finally {
      setPrefsSaving(false);
    }
  }, [localePref, locale, router, checkSession, t]);

  const [curPw, setCurPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const validatePw = () => {
    if (!curPw || !newPw || !confirmPw) return t.security.required;
    if (newPw !== confirmPw) return t.security.mismatch;
    if (newPw.length < 8) return t.security.weak;
    if (!/[a-z]/.test(newPw) || !/[A-Z]/.test(newPw) || !/[0-9]/.test(newPw) || !/[!@#$%^&*()_+\-=[\]{}|;':",./<>?]/.test(newPw))
      return t.security.weak;
    return null;
  };

  const handleChangePassword = useCallback(async () => {
    const err = validatePw();
    if (err) {
      setPwMsg({ kind: "err", text: err });
      return;
    }
    setPwSaving(true);
    setPwMsg(null);
    try {
      await apiClient.post("/auth/change-password", {
        current_password: curPw,
        new_password: newPw,
      });
      setPwMsg({ kind: "ok", text: t.security.success });
      setCurPw("");
      setNewPw("");
      setConfirmPw("");
    } catch (e: any) {
      const detail = e?.response?.data?.detail || e?.message || t.common.error;
      const msg = Array.isArray(detail) ? detail.map((d: any) => d.msg || d.detail || JSON.stringify(d)).join(" · ") : String(detail);
      setPwMsg({ kind: "err", text: msg });
    } finally {
      setPwSaving(false);
    }
  }, [curPw, newPw, confirmPw, t]);

  if (meLoading) {
    return (
      <div className="max-w-6xl mx-auto space-y-4 animate-pulse" dir={dir}>
        <div className="h-8 w-40 bg-slate-200 rounded" />
        <div className="card p-6 h-64" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6" dir={dir}>
      <div>
        <h1 className="text-xl font-bold text-slate-900">{t.title}</h1>
        <p className="text-sm text-slate-500">{t.subtitle}</p>
      </div>

      {meError && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
          <AlertCircle size={16} />
          <span>{meError}</span>
          <button onClick={() => setMeError(null)} className="ms-auto text-red-400 hover:text-red-600">
            ×
          </button>
        </div>
      )}

      <div className="flex gap-2 border-b border-slate-200 pb-0 overflow-x-auto">
        {(
          [
            ["profile", t.tabs.profile, UserIcon],
            ["security", t.tabs.security, Lock],
            ["preferences", t.tabs.preferences, Languages],
            ...(user?.is_superadmin ? [["system", t.system.heading, Building2] as const] : []),
          ] as const
        ).map(([key, label, Icon]) => (
          <button
            key={key}
            onClick={() => setTab(key as TabKey)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px whitespace-nowrap transition-colors ${
              tab === key
                ? "border-brand-600 text-brand-600"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </div>

      {tab === "profile" && (
        <div className="card p-6 space-y-5">
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <UserIcon size={16} className="text-slate-400" />
            {t.profile.heading}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="text-xs font-semibold text-slate-500">{t.profile.fullName}</label>
              <div className="mt-1 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-sm text-slate-900">
                {user?.full_name || "—"}
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500">{t.profile.email}</label>
              <div className="mt-1 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-sm text-slate-900 flex items-center justify-between gap-2">
                <span className="truncate">{user?.email || "—"}</span>
                <span className="badge badge-muted shrink-0">{t.prefs.comingSoon}</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">{t.profile.emailHint}</p>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500">{t.profile.role}</label>
              <div className="mt-1 flex items-center gap-2">
                <span className="badge bg-brand-50 text-brand-700 border border-brand-100">
                  <ShieldCheck size={12} className="me-1" />
                  {roleLabel}
                </span>
                {user?.is_superadmin && <span className="badge badge-warning">{t.profile.superadmin}</span>}
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500">{t.profile.status}</label>
              <div className="mt-1">
                <span className={`badge ${user?.is_active ? "badge-success" : "badge-muted"}`}>
                  {user?.is_active ? t.profile.active : t.profile.inactive}
                </span>
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500">{t.profile.locale}</label>
              <div className="mt-1 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-sm text-slate-900">
                {user?.locale_pref === "en" ? "English" : "العربية"}
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === "security" && (
        <div className="card p-6 space-y-5">
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Lock size={16} className="text-slate-400" />
            {t.security.heading}
          </h2>
          {pwMsg && (
            <div
              className={`flex items-center gap-2 p-3 rounded-lg border text-sm ${
                pwMsg.kind === "ok"
                  ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                  : "bg-red-50 border-red-200 text-red-700"
              }`}
            >
              {pwMsg.kind === "ok" ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
              <span>{pwMsg.text}</span>
              <button onClick={() => setPwMsg(null)} className="ms-auto opacity-60 hover:opacity-100">
                ×
              </button>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl">
            <div className="md:col-span-2">
              <label className="text-xs font-semibold text-slate-700">{t.security.current}</label>
              <input
                type="password"
                value={curPw}
                onChange={(e) => setCurPw(e.target.value)}
                className="input-field mt-1"
                autoComplete="current-password"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700">{t.security.newPass}</label>
              <input
                type="password"
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                className="input-field mt-1"
                autoComplete="new-password"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700">{t.security.confirm}</label>
              <input
                type="password"
                value={confirmPw}
                onChange={(e) => setConfirmPw(e.target.value)}
                className="input-field mt-1"
                autoComplete="new-password"
              />
            </div>
          </div>
          <div>
            <button onClick={handleChangePassword} disabled={pwSaving} className="btn-primary inline-flex items-center gap-2">
              {pwSaving && <Loader2 size={14} className="animate-spin" />}
              {t.security.submit}
            </button>
          </div>
        </div>
      )}

      {tab === "preferences" && (
        <div className="space-y-4">
          <div className="card p-6 space-y-5">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Languages size={16} className="text-slate-400" />
              {t.prefs.heading}
            </h2>
            {prefsMsg && (
              <div
                className={`flex items-center gap-2 p-3 rounded-lg border text-sm ${
                  prefsMsg.kind === "ok"
                    ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                    : "bg-red-50 border-red-200 text-red-700"
                }`}
              >
                {prefsMsg.kind === "ok" ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                <span>{prefsMsg.text}</span>
                <button onClick={() => setPrefsMsg(null)} className="ms-auto opacity-60 hover:opacity-100">
                  ×
                </button>
              </div>
            )}
            <div className="max-w-sm space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-700">{t.prefs.language}</label>
                <select value={localePref} onChange={(e) => setLocalePref(e.target.value)} className="select-field mt-1">
                  <option value="ar">العربية</option>
                  <option value="en">English</option>
                </select>
                <p className="text-[11px] text-slate-400 mt-1">{t.prefs.languageHint}</p>
              </div>
              <button onClick={handleSavePrefs} disabled={prefsSaving} className="btn-primary inline-flex items-center gap-2">
                {prefsSaving && <Loader2 size={14} className="animate-spin" />}
                {prefsSaving ? t.common.saving : t.prefs.save}
              </button>
            </div>
          </div>

          <div className="card p-6">
            <h3 className="text-sm font-semibold text-slate-900">{t.prefs.notificationsTitle}</h3>
            <p className="text-xs text-slate-500 mt-1">{t.prefs.notificationsHint}</p>
            <span className="badge badge-muted mt-3">{t.prefs.comingSoon}</span>
          </div>
        </div>
      )}

      {tab === "system" && (user?.is_superadmin ? <SystemTab t={t} dir={dir} /> : (
        <div className="card p-6 text-center py-10">
          <AlertCircle className="mx-auto text-slate-300 mb-2" size={32} />
          <p className="text-sm text-slate-500">{t.system.headingHint}</p>
        </div>
      )) }
    </div>
  );
}

function SystemTab({ t, dir }: { t: any; dir: string }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [timezone, setTimezone] = useState("Asia/Riyadh");
  const [teacherPct, setTeacherPct] = useState("");
  const [backupRetention, setBackupRetention] = useState("");

  useEffect(() => {
    let cancelled = false;
    apiClient.get("/settings/system").then((res) => {
      if (cancelled) return;
      const d = res.data as any;
      setName(d.institute_profile?.name || "Al-Drasat ERP");
      setAddress(d.institute_profile?.address || "");
      setPhone(d.institute_profile?.phone || "");
      setTimezone(d.defaults?.timezone || "Asia/Riyadh");
      setTeacherPct(d.defaults?.default_teacher_percentage != null ? String(d.defaults.default_teacher_percentage) : "");
      setBackupRetention(d.defaults?.backup_retention_days != null ? String(d.defaults.backup_retention_days) : "");
    }).catch(() => {
      if (!cancelled) setMsg({ kind: "err", text: t.common.error });
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = async () => {
    setSaving(true);
    setMsg(null);
    try {
      await apiClient.put("/settings/system", {
        institute_profile: { name: name || "Al-Drasat ERP", address: address || null, phone: phone || null, logo_path: "/logo.jpeg" },
        defaults: {
          timezone,
          default_teacher_percentage: teacherPct ? Number(teacherPct) : null,
          backup_retention_days: backupRetention ? Number(backupRetention) : null,
        },
      });
      setMsg({ kind: "ok", text: t.system.saved });
    } catch (e: any) {
      const detail = e?.response?.data?.detail || e?.message || t.common.error;
      const msgText = Array.isArray(detail) ? detail.map((d: any) => d.msg || d.detail || String(d)).join(" · ") : String(detail);
      setMsg({ kind: "err", text: msgText });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="card p-6 h-40 animate-pulse" />;

  return (
    <div className="space-y-4" dir={dir}>
      {msg && (
        <div className={`flex items-center gap-2 p-3 rounded-lg border text-sm ${msg.kind === "ok" ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-red-50 border-red-200 text-red-700"}`}>
          {msg.kind === "ok" ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          <span>{msg.text}</span>
          <button onClick={() => setMsg(null)} className="ms-auto opacity-60 hover:opacity-100">×</button>
        </div>
      )}
      <div className="card p-6 space-y-5">
        <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2"><Building2 size={16} className="text-slate-400" />{t.system.heading}<span className="text-xs font-normal text-slate-400">— {t.system.headingHint}</span></h2>

        <div>
          <h3 className="text-xs font-semibold text-slate-600 mb-3">{t.system.institute}</h3>
          <div className="flex gap-6 flex-wrap">
            <div className="flex flex-col items-center gap-2">
              <BrandLogo className="w-20 h-20" />
              <span className="badge badge-muted">{t.system.logoComingSoon}</span>
            </div>
            <div className="flex-1 min-w-[260px] grid grid-cols-1 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-700">{t.system.name}</label>
                <input value={name} onChange={(e) => setName(e.target.value)} className="input-field mt-1" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700">{t.system.address}</label>
                <input value={address} onChange={(e) => setAddress(e.target.value)} className="input-field mt-1" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700">{t.system.phone}</label>
                <input value={phone} onChange={(e) => setPhone(e.target.value)} className="input-field mt-1" />
              </div>
            </div>
          </div>
        </div>

        <div>
          <h3 className="text-xs font-semibold text-slate-600 mb-3">{t.system.defaults}</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-700">{t.system.timezone}</label>
              <input value={timezone} onChange={(e) => setTimezone(e.target.value)} className="input-field mt-1" placeholder="Asia/Riyadh" />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700">{t.system.teacherPct}</label>
              <input type="number" value={teacherPct} onChange={(e) => setTeacherPct(e.target.value)} className="input-field mt-1" placeholder="e.g. 60" />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700">{t.system.backupRetention}</label>
              <input type="number" value={backupRetention} onChange={(e) => setBackupRetention(e.target.value)} className="input-field mt-1" placeholder="e.g. 30" />
            </div>
          </div>
        </div>

        <button onClick={handleSave} disabled={saving} className="btn-primary inline-flex items-center gap-2">
          {saving && <Loader2 size={14} className="animate-spin" />}
          {saving ? t.common.saving : t.system.save}
        </button>
      </div>
    </div>
  );
}
