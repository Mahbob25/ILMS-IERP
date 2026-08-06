"use client";

import React, { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { apiClient } from "@/lib/api";
import { sanitizeInput } from "@/lib/utils/input";
import { useAuth } from "@/components/AuthContext";
import ConfirmModal from "@/components/ConfirmModal";
import RefreshButton from "@/components/RefreshButton";
import {
  Loader2, Shield, AlertCircle, Save, RotateCcw,
} from "lucide-react";

interface Permission {
  id: string;
  codename: string;
  label: string;
  group: string;
}

interface RoleInfo {
  id: string;
  name: string;
}

const PERMISSION_GROUPS: Record<string, string> = {
  general: "General",
  academic: "Academic",
  operations: "Operations",
  financial: "Financial",
  system: "System",
};

const SYSTEM_ROLE_NAMES: Record<string, string> = {
  superadmin: "Super Admin",
  manager: "Manager",
  secretary: "Secretary",
  teacher: "Teacher",
};

export default function RolesPage() {
  const params = useParams();
  const locale = (params?.locale as string) || "ar";
  const { user, permissions: authPermissions } = useAuth();
  const isRtl = locale === "ar";

  const [roles, setRoles] = useState<RoleInfo[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [rolePerms, setRolePerms] = useState<Map<string, Set<string>>>(new Map());
  const [activeRoleId, setActiveRoleId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [confirmSwitch, setConfirmSwitch] = useState<{ roleId: string } | null>(null);

  const submitting = saving;

  const t = {
    ar: {
      title: "صلاحيات الأدوار", noPerm: "لا توجد صلاحيات بعد",
      save: "حفظ التغييرات", cancel: "إلغاء التغييرات", saved: "تم الحفظ",
      saveErr: "فشل الحفظ", search: "بحث...",
    },
    en: {
      title: "Role Permissions", noPerm: "No permissions configured yet",
      save: "Save Changes", cancel: "Cancel Changes", saved: "Saved",
      saveErr: "Failed to save", search: "Search...",
    },
  }[locale === "en" ? "en" : "ar"];

  useEffect(() => {
    if (!user?.is_superadmin && !authPermissions.includes("page_roles")) return;
    Promise.all([
      apiClient.get<Permission[]>("/permissions"),
      apiClient.get<RoleInfo[]>("/users/roles"),
    ]).then(([permRes, roleRes]) => {
      setPermissions(permRes.data);
      setRoles(roleRes.data);
      if (roleRes.data.length > 0) {
        setActiveRoleId(roleRes.data[0].id);
      }
    }).finally(() => setLoading(false));
  }, [user]);

  useEffect(() => {
    if (!activeRoleId) return;
    apiClient.get<{role_id: string; permission_codenames: string[]}>(`/permissions/roles/${activeRoleId}`)
      .then((res) => {
        setRolePerms((prev) => {
          const next = new Map(prev);
          next.set(activeRoleId, new Set(res.data.permission_codenames));
          return next;
        });
        setDirty(false);
      });
  }, [activeRoleId]);

  const togglePerm = (codename: string) => {
    setRolePerms((prev) => {
      const next = new Map(prev);
      const current = new Set(prev.get(activeRoleId) || []);
      if (current.has(codename)) current.delete(codename);
      else current.add(codename);
      next.set(activeRoleId, current);
      return next;
    });
    setDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const codenames = Array.from(rolePerms.get(activeRoleId) || []);
      await apiClient.put(`/permissions/roles/${activeRoleId}`, { permission_codenames: codenames });
      setDirty(false);
    } catch {
      setFetchError(t.saveErr);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    apiClient.get<{role_id: string; permission_codenames: string[]}>(`/permissions/roles/${activeRoleId}`)
      .then((res) => {
        setRolePerms((prev) => {
          const next = new Map(prev);
          next.set(activeRoleId, new Set(res.data.permission_codenames));
          return next;
        });
        setDirty(false);
      });
  };

  if (!user?.is_superadmin && !authPermissions.includes("page_roles")) {
    return (
      <div className="max-w-6xl mx-auto text-center py-20">
        <AlertCircle className="mx-auto text-red-400 mb-4" size={48} />
        <p className="text-red-500 font-medium">Access denied</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="animate-spin text-slate-400" size={24} />
      </div>
    );
  }

  const activeRole = roles.find((r) => r.id === activeRoleId);
  const groupedPerms = permissions.reduce<Record<string, Permission[]>>((acc, p) => {
    (acc[p.group] ||= []).push(p);
    return acc;
  }, {});

  return (
    <div className="space-y-6 max-w-6xl mx-auto animate-fade-in" dir={isRtl ? "rtl" : "ltr"}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center">
            <Shield size={22} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">{t.title}</h2>
            {activeRole && (
              <p className="text-xs text-slate-400">
                {SYSTEM_ROLE_NAMES[activeRole.name] || activeRole.name}
              </p>
            )}
          </div>
        </div>
        <RefreshButton />
      </div>

      <div className="flex gap-2 flex-wrap">
        {roles.map((role) => (
          <button
            key={role.id}
            onClick={() => { if (!dirty) { setActiveRoleId(role.id); setDirty(false); } else { setConfirmSwitch({ roleId: role.id }); } }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeRoleId === role.id
                ? "bg-brand-50 text-brand-700 border-brand-200 shadow-sm"
                : "bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100"
            } border`}
          >
            {SYSTEM_ROLE_NAMES[role.name] || role.name}
          </button>
        ))}
      </div>

      {fetchError && (
        <div className="flex items-center gap-2 p-4 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
          <AlertCircle size={16} />
          <span>{fetchError}</span>
          <button onClick={() => setFetchError(null)} className="ms-auto text-red-400 hover:text-red-600">&times;</button>
        </div>
      )}

      {Object.entries(groupedPerms).map(([group, perms]) => (
        <div key={group} className="card p-5">
          <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-3">
            {PERMISSION_GROUPS[group] || group}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {perms.map((perm) => {
              const isActive = (rolePerms.get(activeRoleId) || new Set()).has(perm.codename);
              return (
                <button
                  key={perm.id}
                  onClick={() => togglePerm(perm.codename)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg border transition-all ${
                    isActive
                      ? "bg-brand-50 border-brand-200"
                      : "bg-white border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-all ${
                    isActive
                      ? "bg-brand-500 border-brand-500"
                      : "border-slate-300"
                  }`}>
                    {isActive && <div className="w-2 h-2 rounded-sm bg-white" />}
                  </div>
                  <span className={`text-sm font-medium ${
                    isActive ? "text-brand-700" : "text-slate-600"
                  }`}>
                    {perm.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {permissions.length === 0 && (
        <div className="card p-8 text-center">
          <p className="text-slate-400 text-sm">{t.noPerm}</p>
        </div>
      )}

      {dirty && (
        <div className="sticky bottom-6 flex items-center justify-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-primary flex items-center gap-2 px-6 shadow-lg"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            <span>{t.save}</span>
          </button>
          <button
            onClick={handleReset}
            disabled={saving}
            className="btn-ghost flex items-center gap-2 px-6 shadow-lg"
          >
            <RotateCcw size={16} />
            <span>{t.cancel}</span>
          </button>
        </div>
      )}

      <ConfirmModal
        open={confirmSwitch !== null}
        title={isRtl ? "تغييرات غير محفوظة" : "Unsaved Changes"}
        message={isRtl ? "لديك تغييرات غير محفوظة. هل ترغب في التخلي عنها؟" : "You have unsaved changes. Discard?"}
        confirmLabel={isRtl ? "تجاهل" : "Discard"}
        cancelLabel={isRtl ? "إلغاء" : "Cancel"}
        isRtl={isRtl}
        onConfirm={() => {
          if (confirmSwitch) {
            setActiveRoleId(confirmSwitch.roleId);
            setDirty(false);
          }
          setConfirmSwitch(null);
        }}
        onCancel={() => setConfirmSwitch(null)}
      />
    </div>
  );
}
