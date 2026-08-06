"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { apiClient } from "@/lib/api";
import { useAuth } from "@/components/AuthContext";
import AccessDenied from "@/components/AccessDenied";
import RefreshButton from "@/components/RefreshButton";
import ConfirmModal from "@/components/ConfirmModal";
import EmptyState from "@/components/EmptyState";
import UndoToast from "@/components/UndoToast";
import {
  Database,
  Plus,
  Download,
  Trash2,
  AlertCircle,
  FileArchive,
  HardDrive,
  Clock,
  Loader2,
} from "lucide-react";

interface BackupItem {
  id: string;
  filename: string;
  kind: "database" | "uploads";
  size_bytes: number;
  size_display: string;
  created_at: string;
}

interface BackupsData {
  items: BackupItem[];
  total: number;
  last_backup: string | null;
  total_size_bytes: number;
  disk_free_gb: number;
}

function totalDisplay(bytes: number): string {
  if (bytes <= 0) return "0 B";
  const size = bytes;
  const units = ["B", "KB", "MB", "GB"];
  let value = size;
  let unit = "B";
  for (const u of units) {
    if (value < 1024 || u === "GB") {
      unit = u;
      break;
    }
    value /= 1024;
  }
  return unit === "B" ? `${value} B` : `${value.toFixed(1)} ${unit}`;
}

export default function BackupsPage() {
  const params = useParams();
  const locale = (params?.locale as string) || "ar";
  const isRtl = locale === "ar";
  const { user, permissions: authPermissions } = useAuth();

  const [data, setData] = useState<BackupsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<BackupItem | null>(null);
  const [undoItem, setUndoItem] = useState<BackupItem | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const t = {
    ar: {
      title: "النسخ الاحتياطي",
      subtitle: "إدارة نسخ قاعدة البيانات الاحتياطية",
      create: "إنشاء نسخة احتياطية",
      creating: "جارٍ الإنشاء...",
      refresh: "تحديث",
      total: "إجمالي النسخ",
      lastBackup: "آخر نسخة",
      totalSize: "الحجم الإجمالي",
      diskFree: "المساحة المتاحة",
      none: "لا توجد نسخ احتياطية",
      noneMsg: "لم يتم إنشاء أي نسخة احتياطية بعد.",
      file: "الملف",
      size: "الحجم",
      date: "التاريخ",
      actions: "إجراءات",
      download: "تنزيل",
      delete: "حذف",
      deleteTitle: "حذف النسخة الاحتياطية",
      deleteConfirm: "حذف",
      cancel: "إلغاء",
      deleteMsg: (name: string) => `سيتم حذف "${name}". يمكن التراجع خلال 8 ثوانٍ.`,
      deletedUndo: (name: string) => `تم حذف "${name}"`,
      undo: "تراجع",
      retry: "إعادة المحاولة",
      error: "فشل تحميل النسخ الاحتياطية",
      na: "غير متاح",
      dbKind: "قاعدة بيانات",
      uploadsKind: "ملفات",
    },
    en: {
      title: "Database Backups",
      subtitle: "Manage database backup snapshots",
      create: "Create backup",
      creating: "Creating...",
      refresh: "Refresh",
      total: "Total backups",
      lastBackup: "Last backup",
      totalSize: "Total size",
      diskFree: "Disk free",
      none: "No backups",
      noneMsg: "No backup has been created yet.",
      file: "File",
      size: "Size",
      date: "Date",
      actions: "Actions",
      download: "Download",
      delete: "Delete",
      deleteTitle: "Delete backup",
      deleteConfirm: "Delete",
      cancel: "Cancel",
      deleteMsg: (name: string) => `"${name}" will be deleted. Undo available for 8 seconds.`,
      deletedUndo: (name: string) => `Deleted "${name}"`,
      undo: "Undo",
      retry: "Retry",
      error: "Failed to load backups",
      na: "N/A",
      dbKind: "Database",
      uploadsKind: "Uploads",
    },
  }[isRtl ? "ar" : "en"];

  const fetchBackups = useCallback(async () => {
    setLoading(true);
    setFetchError(false);
    try {
      const res = await apiClient.get<BackupsData>("/database-backups");
      setData(res.data);
    } catch {
      setFetchError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBackups();
  }, [fetchBackups]);

  const handleCreate = useCallback(async () => {
    setCreating(true);
    setActionError(null);
    try {
      await apiClient.post<BackupItem>("/database-backups");
      await fetchBackups();
    } catch {
      setActionError(isRtl ? "فشل إنشاء النسخة الاحتياطية" : "Failed to create backup");
    } finally {
      setCreating(false);
    }
  }, [fetchBackups, isRtl]);

  const handleDownload = useCallback((item: BackupItem) => {
    const a = document.createElement("a");
    a.href = `/api/v1/database-backups/${encodeURIComponent(item.id)}/download`;
    a.download = item.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, []);

  const handleDelete = useCallback(async () => {
    if (!pendingDelete) return;
    setActionError(null);
    setDeletingId(pendingDelete.id);
    try {
      await apiClient.delete(`/database-backups/${encodeURIComponent(pendingDelete.id)}`);
      setUndoItem(pendingDelete);
      await fetchBackups();
    } catch {
      setActionError(isRtl ? "فشل حذف النسخة الاحتياطية" : "Failed to delete backup");
    } finally {
      setDeletingId(null);
      setPendingDelete(null);
    }
  }, [pendingDelete, fetchBackups, isRtl]);

  const handleUndoDelete = useCallback(async () => {
    if (!undoItem) return;
    const item = undoItem;
    setUndoItem(null);
    try {
      await apiClient.post(`/database-backups/${encodeURIComponent(item.id)}/undo-delete`);
      await fetchBackups();
    } catch {
      setActionError(isRtl ? "تعذّر التراجع عن الحذف" : "Could not undo the deletion");
    }
  }, [undoItem, fetchBackups, isRtl]);

  if (!user?.is_superadmin && !authPermissions.includes("page_backups")) {
    return <AccessDenied />;
  }

  if (loading) {
    return (
      <div className="space-y-6 max-w-6xl mx-auto animate-pulse">
        <div className="flex items-center justify-between mb-2">
          <div className="h-7 w-44 bg-slate-200 rounded" />
          <div className="h-9 w-32 bg-slate-200 rounded" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="card p-5 h-20" />
          ))}
        </div>
        <div className="card p-5 h-64" />
      </div>
    );
  }

  if (fetchError || !data) {
    return (
      <div className="max-w-6xl mx-auto text-center py-20">
        <AlertCircle className="mx-auto text-red-400 mb-4" size={48} />
        <p className="text-red-500 font-medium mb-4">{t.error}</p>
        <button
          onClick={fetchBackups}
          className="px-4 py-2 text-sm font-medium rounded-lg bg-brand-500 text-white hover:bg-brand-600 transition-colors"
        >
          {t.retry}
        </button>
      </div>
    );
  }

  const lastBackup = data.last_backup
    ? new Date(data.last_backup).toLocaleString(isRtl ? "ar-SA" : "en-US")
    : t.na;

  return (
    <div className="space-y-6 max-w-6xl mx-auto animate-fade-in" dir={isRtl ? "rtl" : "ltr"}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center">
            <Database size={22} />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">{t.title}</h1>
            <p className="text-xs text-slate-500">{t.subtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCreate}
            disabled={creating}
            className="btn-primary flex items-center gap-2 px-4 py-2 text-sm font-semibold shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {creating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            <span>{creating ? t.creating : t.create}</span>
          </button>
          <RefreshButton onRefresh={fetchBackups} />
        </div>
      </div>

      {actionError && (
        <div className="card p-3 flex items-center gap-2 text-red-600 text-sm">
          <AlertCircle size={16} />
          <span>{actionError}</span>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center shrink-0">
            <Database size={20} />
          </div>
          <div>
            <p className="text-xs text-slate-500">{t.total}</p>
            <p className="text-xl font-bold text-slate-900">{data.total}</p>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <Clock size={20} />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-slate-500">{t.lastBackup}</p>
            <p className="text-sm font-semibold text-blue-600 truncate">{lastBackup}</p>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-violet-50 text-violet-600 flex items-center justify-center shrink-0">
            <FileArchive size={20} />
          </div>
          <div>
            <p className="text-xs text-slate-500">{t.totalSize}</p>
            <p className="text-sm font-semibold text-slate-900">{totalDisplay(data.total_size_bytes)}</p>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <HardDrive size={20} />
          </div>
          <div>
            <p className="text-xs text-slate-500">{t.diskFree}</p>
            <p className="text-sm font-semibold text-slate-900">{data.disk_free_gb.toFixed(1)} GB</p>
          </div>
        </div>
      </div>

      {/* Backups table */}
      <div className="card p-5">
        {data.items.length === 0 ? (
          <EmptyState title={t.none} message={t.noneMsg} />
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table w-full">
              <thead>
                <tr>
                  <th className="text-start">{t.file}</th>
                  <th className="text-start">{t.size}</th>
                  <th className="text-start">{t.date}</th>
                  <th className="text-end">{t.actions}</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <div className="flex items-center gap-2">
                        <FileArchive size={16} className="text-slate-400 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-900 truncate">{item.filename}</p>
                          <span className="badge badge-muted text-[10px]">
                            {item.kind === "uploads" ? t.uploadsKind : t.dbKind}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="text-sm text-slate-600">{item.size_display}</td>
                    <td className="text-sm text-slate-600">
                      {new Date(item.created_at).toLocaleString(isRtl ? "ar-SA" : "en-US")}
                    </td>
                    <td className="text-end">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleDownload(item)}
                          className="btn-icon"
                          title={t.download}
                        >
                          <Download size={16} />
                        </button>
                        <button
                          onClick={() => setPendingDelete(item)}
                          disabled={deletingId === item.id}
                          className="btn-icon text-red-500 hover:text-red-600 hover:bg-red-50"
                          title={t.delete}
                        >
                          {deletingId === item.id ? (
                            <Loader2 size={16} className="animate-spin" />
                          ) : (
                            <Trash2 size={16} />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConfirmModal
        open={pendingDelete !== null}
        title={t.deleteTitle}
        message={pendingDelete ? t.deleteMsg(pendingDelete.filename) : ""}
        confirmLabel={t.deleteConfirm}
        cancelLabel={t.cancel}
        onConfirm={handleDelete}
        onCancel={() => setPendingDelete(null)}
        isRtl={isRtl}
      />

      {undoItem && (
        <UndoToast
          message={t.deletedUndo(undoItem.filename)}
          durationSeconds={8}
          isRtl={isRtl}
          onUndo={handleUndoDelete}
          onDismiss={() => setUndoItem(null)}
        />
      )}
    </div>
  );
}
