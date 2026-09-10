"use client";

import React from "react";
import { useParams } from "next/navigation";
import {
  Database,
  Activity,
  HardDrive,
  Cpu,
  Gauge,
  Users,
  GraduationCap,
  BookOpen,
  AlertCircle,
  AlertTriangle,
  Boxes,
  GitBranch,
  Server,
  Clock,
  Archive,
  Info,
} from "lucide-react";
import RefreshButton from "@/components/RefreshButton";
import useSystemHealth, {
  percentColor,
  percentBg,
  formatGB,
} from "@/hooks/useSystemHealth";

type StatusTone = "ok" | "warn" | "fail" | "unknown" | "info";

const TONE_TEXT: Record<StatusTone, string> = {
  ok: "text-emerald-600",
  warn: "text-amber-600",
  fail: "text-red-600",
  unknown: "text-slate-900",
  info: "text-blue-600",
};

const TONE_BADGE: Record<StatusTone, string> = {
  ok: "badge badge-success",
  warn: "badge badge-warning",
  fail: "badge bg-red-50 text-red-600 border border-red-200",
  unknown: "badge badge-muted",
  info: "badge bg-blue-50 text-blue-600 border border-blue-100",
};

const TONE_DOT: Record<StatusTone, string> = {
  ok: "bg-emerald-500",
  warn: "bg-amber-500",
  fail: "bg-red-500",
  unknown: "bg-slate-300",
  info: "bg-blue-500",
};

function toneFor(status: string | null | undefined): StatusTone {
  switch (status) {
    case "ok":
    case "in_sync":
    case "connected":
    case "healthy":
      return "ok";
    case "warn":
    case "behind":
    case "degraded":
      return "warn";
    case "fail":
    case "missing_revision":
    case "unreachable":
    case "disconnected":
      return "fail";
    case "not_configured":
      return "info";
    default:
      return "unknown";
  }
}

function labelFor(status: string | null | undefined, tx: any): string {
  switch (status) {
    case "ok":
    case "in_sync":
      return tx.statusOk;
    case "warn":
      return tx.statusWarn;
    case "behind":
      return tx.statusBehind;
    case "fail":
      return tx.statusFail;
    case "missing_revision":
      return tx.statusMissingRevision;
    case "degraded":
      return tx.statusDegraded;
    case "unreachable":
      return tx.statusUnreachable;
    case "not_configured":
      return tx.statusNotConfigured;
    default:
      return tx.statusUnknown;
  }
}

function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function StatusBadge({ tone, label }: { tone: StatusTone; label: string }) {
  return <span className={TONE_BADGE[tone]}>{label}</span>;
}

function StatusDot({ tone }: { tone: StatusTone }) {
  return (
    <span className={`w-2 h-2 rounded-full inline-block shrink-0 ${TONE_DOT[tone]}`} />
  );
}

function MetricRow({
  label,
  value,
  tone = "unknown",
}: {
  label: string;
  value: React.ReactNode;
  tone?: StatusTone;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-slate-500">{label}</span>
      <span className={`text-sm font-semibold ${TONE_TEXT[tone]}`}>{value}</span>
    </div>
  );
}

function MetricCard({
  icon,
  title,
  badge,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
          <span className="text-slate-500">{icon}</span>
          <span>{title}</span>
        </h3>
        {badge}
      </div>
      {children}
    </div>
  );
}

export default function HealthPage() {
  const params = useParams();
  const locale = (params?.locale as string) || "ar";

  const { data, loading, error, refetch: fetchHealth } = useSystemHealth();

  const t = {
    ar: {
      title: "صحة النظام",
      dbStatus: "قاعدة البيانات",
      apiUptime: "وقت تشغيل API",
      storage: "مساحة التخزين",
      memory: "الذاكرة",
      cpu: "المعالج",
      totalUsers: "إجمالي المستخدمين",
      totalStudents: "إجمالي الطلاب",
      totalCourses: "إجمالي المقررات",
      totalEnrollments: "إجمالي التسجيلات",
      serviceInfo: "معلومات الخدمة",
      version: "الإصدار",
      uptime: "وقت التشغيل",
      lastBackup: "آخر نسخة احتياطية",
      connected: "متصل",
      disconnected: "غير متصل",
      na: "غير متاح",
      retry: "إعادة المحاولة",
      error: "فشل تحميل بيانات صحة النظام",
    },
    en: {
      title: "System Health",
      dbStatus: "Database",
      apiUptime: "API Uptime",
      storage: "Storage",
      memory: "Memory",
      cpu: "CPU",
      totalUsers: "Total Users",
      totalStudents: "Total Students",
      totalCourses: "Total Courses",
      totalEnrollments: "Total Enrollments",
      serviceInfo: "Service Info",
      version: "Version",
      uptime: "Uptime",
      lastBackup: "Last Backup",
      connected: "Connected",
      disconnected: "Disconnected",
      na: "N/A",
      retry: "Retry",
      error: "Failed to load system health data",
    },
  }[locale === "en" ? "en" : "ar"];

  const tx = {
    ar: {
      metricsSource: "مصدر القياسات",
      sourceCgroup: "الحاوية (cgroup)",
      sourceHost: "المضيف (psutil)",
      hostDisk: "قرص المضيف",
      containerMemory: "ذاكرة الحاوية",
      containerCpu: "معالج الحاوية",
      migrations: "ترحيلات قاعدة البيانات",
      dbRevision: "إصدار قاعدة البيانات",
      codeHead: "إصدار الكود",
      databaseSection: "قاعدة البيانات",
      dbSize: "الحجم",
      dbConnections: "الاتصالات",
      dbActive: "نشطة",
      dbIdleTxn: "معاملات خاملة",
      dbLongestTxn: "أطول معاملة",
      dbBlockingLocks: "أقفال معطِّلة",
      dbTables: "الجداول",
      redisSection: "ريديس",
      redisVersion: "الإصدار",
      redisLatency: "زمن الاستجابة",
      redisClients: "العملاء المتصلون",
      redisMemory: "الذاكرة",
      redisPolicy: "سياسة الإخلاء",
      redisEvicted: "المفاتيح المُخلّاة",
      redisHitRate: "نسبة الإصابات",
      redisAof: "AOF",
      redisRdb: "RDB",
      redisStreams: "طوابير المهام",
      servicesSection: "الخدمات",
      jobsSection: "المهام اليومية",
      backupsSection: "النسخ الاحتياطية",
      backupLast: "آخر نسخة",
      backupAge: "العمر",
      backupCount: "العدد",
      backupSize: "الحجم",
      backupFree: "مساحة حرة",
      statusOk: "سليم",
      statusWarn: "تحذير",
      statusFail: "خطأ",
      statusDegraded: "متدهور",
      statusUnreachable: "غير متاح",
      statusBehind: "متأخر",
      statusMissingRevision: "ملف الترحيل مفقود",
      statusNotConfigured: "غير مُهيّأ",
      statusUnknown: "غير معروف",
      healthy: "سليمة",
      stale: "متوقفة",
      never: "لم تعمل",
      on: "مُفعّل",
      off: "مُعطّل",
      na: "غير متاح",
    },
    en: {
      metricsSource: "Metrics source",
      sourceCgroup: "container (cgroup)",
      sourceHost: "host (psutil)",
      hostDisk: "Host Disk",
      containerMemory: "Container Memory",
      containerCpu: "Container CPU",
      migrations: "Database Migrations",
      dbRevision: "Database revision",
      codeHead: "Code head",
      databaseSection: "Database",
      dbSize: "Size",
      dbConnections: "Connections",
      dbActive: "Active",
      dbIdleTxn: "Idle in transaction",
      dbLongestTxn: "Longest transaction",
      dbBlockingLocks: "Blocking locks",
      dbTables: "Tables",
      redisSection: "Redis",
      redisVersion: "Version",
      redisLatency: "Latency",
      redisClients: "Connected clients",
      redisMemory: "Memory",
      redisPolicy: "Eviction policy",
      redisEvicted: "Evicted keys",
      redisHitRate: "Hit rate",
      redisAof: "AOF",
      redisRdb: "RDB",
      redisStreams: "Job streams",
      servicesSection: "Services",
      jobsSection: "Daily Jobs",
      backupsSection: "Backups",
      backupLast: "Latest",
      backupAge: "Age",
      backupCount: "Count",
      backupSize: "Total size",
      backupFree: "Free space",
      statusOk: "OK",
      statusWarn: "Warning",
      statusFail: "Error",
      statusDegraded: "Degraded",
      statusUnreachable: "Unreachable",
      statusBehind: "Behind",
      statusMissingRevision: "Migration file missing",
      statusNotConfigured: "Not configured",
      statusUnknown: "Unknown",
      healthy: "Healthy",
      stale: "Stalled",
      never: "Never",
      on: "Enabled",
      off: "Disabled",
      na: "N/A",
    },
  }[locale === "en" ? "en" : "ar"];

  if (loading) {
    return (
      <div className="space-y-6 max-w-6xl mx-auto animate-pulse">
        <div className="flex items-center justify-between mb-2">
          <div className="h-7 w-40 bg-slate-200 rounded" />
          <div className="h-8 w-8 bg-slate-200 rounded" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="card p-5 h-20" />
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="card h-20" />
          ))}
        </div>
        <div className="card p-5 h-32" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-6xl mx-auto text-center py-20">
        <AlertCircle className="mx-auto text-red-400 mb-4" size={48} />
        <p className="text-red-500 font-medium mb-4">{t.error}</p>
        <button
          onClick={fetchHealth}
          className="px-4 py-2 text-sm font-medium rounded-lg bg-brand-500 text-white hover:bg-brand-600 transition-colors"
        >
          {t.retry}
        </button>
      </div>
    );
  }

  const dbConnected = data.db_status === "connected";

  return (
    <div className="space-y-6 max-w-6xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-slate-900">{t.title}</h1>
        </div>
        <div className="flex items-center gap-3">
          {data.resources && (
            <span className="badge badge-muted" title={`${tx.metricsSource}: ${data.resources.source}`}>
              {tx.metricsSource}:{" "}
              {data.resources.source === "cgroup" ? tx.sourceCgroup : tx.sourceHost}
            </span>
          )}
          <RefreshButton onRefresh={fetchHealth} />
        </div>
      </div>

      {/* Status cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="card p-4 flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-lg ${
              dbConnected ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"
            } flex items-center justify-center shrink-0`}
          >
            <Database size={20} />
          </div>
          <div>
            <p className="text-xs text-slate-500">{t.dbStatus}</p>
            <p
              className={`text-sm font-semibold flex items-center gap-1 ${
                dbConnected ? "text-emerald-600" : "text-red-600"
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full inline-block ${
                  dbConnected ? "bg-emerald-500" : "bg-red-500"
                }`}
              />
              {dbConnected ? t.connected : t.disconnected}
            </p>
          </div>
        </div>

        <div className="card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <Activity size={20} />
          </div>
          <div>
            <p className="text-xs text-slate-500">{t.apiUptime}</p>
            <p className="text-sm font-semibold text-blue-600">{data.api_uptime}</p>
          </div>
        </div>

        <div className="card p-4 flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-lg ${percentBg(data.disk_usage_percent)} flex items-center justify-center shrink-0`}
          >
            <HardDrive size={20} />
          </div>
          <div>
            <p className="text-xs text-slate-500">{tx.hostDisk}</p>
            <p className={`text-sm font-bold ${percentColor(data.disk_usage_percent)}`}>
              {data.disk_usage_percent}%
            </p>
            <p className="text-xs text-slate-400">
              {formatGB(data.disk_used_gb)} / {formatGB(data.disk_total_gb)}
            </p>
          </div>
        </div>

        <div className="card p-4 flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-lg ${percentBg(data.memory_percent)} flex items-center justify-center shrink-0`}
          >
            <Cpu size={20} />
          </div>
          <div>
            <p className="text-xs text-slate-500">{tx.containerMemory}</p>
            <p className={`text-sm font-bold ${percentColor(data.memory_percent)}`}>
              {data.memory_percent}%
            </p>
            <p className="text-xs text-slate-400">
              {formatGB(data.memory_used_gb)} / {formatGB(data.memory_total_gb)}
            </p>
          </div>
        </div>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="card p-4 flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-lg ${percentBg(data.cpu_percent)} flex items-center justify-center shrink-0`}
          >
            <Gauge size={20} />
          </div>
          <div>
            <p className="text-xs text-slate-500">{tx.containerCpu}</p>
            <p className={`text-sm font-bold ${percentColor(data.cpu_percent)}`}>
              {data.cpu_percent}%
            </p>
          </div>
        </div>

        <div className="card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <Users size={20} />
          </div>
          <div>
            <p className="text-xl font-bold text-slate-900">{data.total_users}</p>
            <p className="text-xs text-slate-500">{t.totalUsers}</p>
          </div>
        </div>

        <div className="card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <GraduationCap size={20} />
          </div>
          <div>
            <p className="text-xl font-bold text-slate-900">{data.total_students}</p>
            <p className="text-xs text-slate-500">{t.totalStudents}</p>
          </div>
        </div>

        <div className="card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-violet-50 text-violet-600 flex items-center justify-center shrink-0">
            <BookOpen size={20} />
          </div>
          <div>
            <p className="text-xl font-bold text-slate-900">{data.total_courses + data.total_enrollments}</p>
            <p className="text-xs text-slate-500">{t.totalCourses} + {t.totalEnrollments}</p>
          </div>
        </div>
      </div>

      {/* Service info */}
      <div className="card p-5">
        <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
          <Info size={16} className="text-slate-500" />
          <span>{t.serviceInfo}</span>
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <p className="text-xs text-slate-500">{t.version}</p>
            <p className="text-sm font-semibold text-slate-900">{data.service} v{data.version}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">{t.uptime}</p>
            <p className="text-sm font-semibold text-blue-600">{data.api_uptime}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">{t.lastBackup}</p>
            <p className="text-sm font-semibold text-slate-900">
              {data.last_backup
                ? new Date(data.last_backup).toLocaleString(locale === "ar" ? "ar-SA" : "en-US")
                : t.na}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500">{t.dbStatus}</p>
            <p
              className={`text-sm font-semibold flex items-center gap-1 ${
                dbConnected ? "text-emerald-600" : "text-red-600"
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full inline-block ${
                  dbConnected ? "bg-emerald-500" : "bg-red-500"
                }`}
              />
              {dbConnected ? t.connected : t.disconnected}
            </p>
          </div>
        </div>
      </div>

      {/* Migrations — the highest-signal check: a DB stamped at a revision with
          no matching file in the image makes the backend crash-loop on boot. */}
      {data.migrations && (
        <MetricCard
          icon={<GitBranch size={16} />}
          title={tx.migrations}
          badge={
            <StatusBadge
              tone={toneFor(data.migrations.status)}
              label={labelFor(data.migrations.status, tx)}
            />
          }
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
            <MetricRow label={tx.dbRevision} value={data.migrations.db_revision || tx.na} />
            <MetricRow label={tx.codeHead} value={data.migrations.code_head || tx.na} />
          </div>
          {data.migrations.detail && (
            <p
              className={`mt-3 text-xs ${
                toneFor(data.migrations.status) === "fail"
                  ? "text-red-600 font-medium"
                  : "text-slate-500"
              }`}
            >
              {data.migrations.detail}
            </p>
          )}
        </MetricCard>
      )}

      {/* Database depth */}
      {data.database && (
        <MetricCard
          icon={<Database size={16} />}
          title={tx.databaseSection}
          badge={
            <StatusBadge
              tone={toneFor(data.database.status)}
              label={labelFor(data.database.status, tx)}
            />
          }
        >
          {data.database.status === "unreachable" ? (
            <p className="text-sm text-slate-500">{data.database.detail || tx.na}</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
              <MetricRow label={tx.dbSize} value={data.database.size_pretty || tx.na} />
              <MetricRow
                label={tx.dbConnections}
                value={
                  data.database.connections != null
                    ? `${data.database.connections} / ${data.database.max_connections ?? "?"}`
                    : tx.na
                }
                tone={(data.database.connections_percent ?? 0) >= 80 ? "warn" : "unknown"}
              />
              <MetricRow label={tx.dbActive} value={data.database.active ?? tx.na} />
              <MetricRow
                label={tx.dbIdleTxn}
                value={data.database.idle_in_transaction ?? tx.na}
                tone={(data.database.idle_in_transaction ?? 0) > 5 ? "warn" : "unknown"}
              />
              <MetricRow
                label={tx.dbLongestTxn}
                value={
                  data.database.longest_transaction_seconds != null
                    ? `${data.database.longest_transaction_seconds}s`
                    : tx.na
                }
              />
              <MetricRow
                label={tx.dbBlockingLocks}
                value={data.database.blocking_locks ?? tx.na}
                tone={(data.database.blocking_locks ?? 0) > 0 ? "warn" : "unknown"}
              />
              <MetricRow label={tx.dbTables} value={data.database.table_count ?? tx.na} />
            </div>
          )}
        </MetricCard>
      )}

      {/* Redis */}
      {data.redis && (
        <MetricCard
          icon={<Boxes size={16} />}
          title={tx.redisSection}
          badge={
            <StatusBadge
              tone={toneFor(data.redis.status)}
              label={labelFor(data.redis.status, tx)}
            />
          }
        >
          {data.redis.status === "ok" ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
                <MetricRow label={tx.redisVersion} value={data.redis.version || tx.na} />
                <MetricRow
                  label={tx.redisLatency}
                  value={data.redis.latency_ms != null ? `${data.redis.latency_ms} ms` : tx.na}
                />
                <MetricRow label={tx.redisClients} value={data.redis.connected_clients ?? tx.na} />
                <MetricRow
                  label={tx.redisMemory}
                  value={`${data.redis.used_memory_human || "?"} / ${
                    data.redis.maxmemory_human || "∞"
                  }`}
                  tone={
                    data.redis.maxmemory_bytes === 0
                      ? "fail"
                      : (data.redis.memory_percent ?? 0) >= 80
                      ? "warn"
                      : "unknown"
                  }
                />
                <MetricRow
                  label={tx.redisPolicy}
                  value={data.redis.policy || tx.na}
                  tone={data.redis.policy?.startsWith("allkeys") ? "fail" : "unknown"}
                />
                <MetricRow label={tx.redisEvicted} value={data.redis.evicted_keys ?? tx.na} />
                <MetricRow
                  label={tx.redisHitRate}
                  value={
                    data.redis.hit_rate != null
                      ? `${(data.redis.hit_rate * 100).toFixed(1)}%`
                      : tx.na
                  }
                />
                <MetricRow
                  label={tx.redisAof}
                  value={
                    data.redis.aof_last_write_status ||
                    (data.redis.aof_enabled ? tx.on : tx.off)
                  }
                  tone={
                    data.redis.aof_last_write_status &&
                    data.redis.aof_last_write_status !== "ok"
                      ? "fail"
                      : "unknown"
                  }
                />
                <MetricRow
                  label={tx.redisRdb}
                  value={data.redis.rdb_last_bgsave_status || tx.na}
                  tone={
                    data.redis.rdb_last_bgsave_status &&
                    data.redis.rdb_last_bgsave_status !== "ok"
                      ? "fail"
                      : "unknown"
                  }
                />
              </div>

              {data.redis.warnings?.length > 0 && (
                <div className="mt-4 space-y-1">
                  {data.redis.warnings.map((warning) => (
                    <p
                      key={warning}
                      className="text-xs text-amber-600 flex items-start gap-1.5"
                    >
                      <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                      <span>{warning}</span>
                    </p>
                  ))}
                </div>
              )}

              {Object.keys(data.redis.streams || {}).length > 0 && (
                <div className="mt-4 pt-4 border-t border-slate-100">
                  <p className="text-xs text-slate-500 mb-3">{tx.redisStreams}</p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
                    {Object.entries(data.redis.streams).map(([name, length]) => (
                      <MetricRow
                        key={name}
                        label={name}
                        value={length ?? tx.na}
                        tone={name === "ai:dlq" && (length ?? 0) > 0 ? "warn" : "unknown"}
                      />
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-slate-500">{data.redis.detail || tx.na}</p>
          )}
        </MetricCard>
      )}

      {/* Sibling services — the honest substitute for container-state checks. */}
      {data.services?.length > 0 && (
        <MetricCard icon={<Server size={16} />} title={tx.servicesSection}>
          <div className="space-y-1">
            {data.services.map((service) => (
              <div
                key={service.name}
                className="flex items-center justify-between gap-3 py-1.5 border-b border-slate-50 last:border-0"
              >
                <span className="flex items-center gap-2 text-sm text-slate-700">
                  <StatusDot tone={toneFor(service.status)} />
                  {service.name}
                </span>
                <span className="flex items-center gap-3">
                  {service.latency_ms != null && (
                    <span className="text-xs text-slate-400">{service.latency_ms} ms</span>
                  )}
                  <StatusBadge
                    tone={toneFor(service.status)}
                    label={labelFor(service.status, tx)}
                  />
                </span>
              </div>
            ))}
          </div>
          {data.services.some((s) => s.detail) && (
            <div className="mt-3 space-y-1">
              {data.services
                .filter((s) => s.detail)
                .map((s) => (
                  <p key={s.name} className="text-xs text-slate-400">
                    {s.name}: {s.detail}
                  </p>
                ))}
            </div>
          )}
        </MetricCard>
      )}

      {/* Daily jobs */}
      {data.jobs?.length > 0 && (
        <MetricCard icon={<Clock size={16} />} title={tx.jobsSection}>
          <div className="space-y-1">
            {data.jobs.map((job) => (
              <div
                key={job.name}
                className="flex items-center justify-between gap-3 py-1.5 border-b border-slate-50 last:border-0"
              >
                <span className="flex items-center gap-2 text-sm text-slate-700">
                  <StatusDot tone={job.healthy ? "ok" : "fail"} />
                  {job.name}
                </span>
                <span className="flex items-center gap-3">
                  <span className="text-xs text-slate-400">{job.last_run_date || tx.never}</span>
                  <StatusBadge
                    tone={job.healthy ? "ok" : "fail"}
                    label={job.healthy ? tx.healthy : tx.stale}
                  />
                </span>
              </div>
            ))}
          </div>
        </MetricCard>
      )}

      {/* Backups */}
      {data.backups && (
        <MetricCard
          icon={<Archive size={16} />}
          title={tx.backupsSection}
          badge={
            <StatusBadge
              tone={toneFor(data.backups.status)}
              label={labelFor(data.backups.status, tx)}
            />
          }
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
            <MetricRow
              label={tx.backupLast}
              value={
                data.backups.last_backup
                  ? new Date(data.backups.last_backup).toLocaleString(
                      locale === "ar" ? "ar-SA" : "en-US"
                    )
                  : tx.na
              }
            />
            <MetricRow
              label={tx.backupAge}
              value={data.backups.age_hours != null ? `${data.backups.age_hours} h` : tx.na}
              tone={
                (data.backups.age_hours ?? 0) > 48
                  ? "fail"
                  : (data.backups.age_hours ?? 0) > 26
                  ? "warn"
                  : "unknown"
              }
            />
            <MetricRow label={tx.backupCount} value={data.backups.count} />
            <MetricRow
              label={tx.backupSize}
              value={formatBytes(data.backups.total_size_bytes)}
            />
            <MetricRow
              label={tx.backupFree}
              value={data.backups.disk_free_gb != null ? `${data.backups.disk_free_gb} GB` : tx.na}
            />
          </div>
          {data.backups.detail && (
            <p
              className={`mt-3 text-xs ${
                data.backups.status === "fail" ? "text-red-600 font-medium" : "text-slate-500"
              }`}
            >
              {data.backups.detail}
            </p>
          )}
        </MetricCard>
      )}
    </div>
  );
}
