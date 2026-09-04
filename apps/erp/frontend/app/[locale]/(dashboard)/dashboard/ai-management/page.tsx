"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@/components/AuthContext";
import { apiClient } from "@/lib/api";
import AccessDenied from "@/components/AccessDenied";
import { sanitizeInput } from "@/lib/utils/input";
import {
  Cpu,
  Save,
  Zap,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Eye,
  EyeOff,
} from "lucide-react";

interface AiConfigData {
  provider: string;
  model: string;
  api_key: string; // "" or the mask "•••"
  max_output_tokens: number;
  temperature: number;
  image_provider: string; // "" = disabled
  image_model: string; // "" = disabled
}

interface TestResponse {
  ok: boolean;
  error?: string | null;
  latency_ms?: number | null;
}

const API_KEY_MASK = "•••";

const KNOWN_PROVIDERS = ["gemini", "openai", "anthropic", "groq", "deepseek", "azure"];

export default function AiManagementPage() {
  const params = useParams();
  const locale = (params?.locale as string) || "ar";
  const isRtl = locale === "ar";
  const { user, permissions } = useAuth();

  const isSuperadmin = !!user?.is_superadmin || permissions.includes("page_ai_management");

  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<AiConfigData | null>(null);
  const [hasStoredKey, setHasStoredKey] = useState(false);

  const [provider, setProvider] = useState("");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [maxTokens, setMaxTokens] = useState("32000");
  const [temperature, setTemperature] = useState("0.7");
  const [imageProvider, setImageProvider] = useState("");
  const [imageModel, setImageModel] = useState("");

  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [loadErr, setLoadErr] = useState(false);

  const t = {
    ar: {
      imageProvider: "مُزوِّد الصور",
      imageProviderHint: "gemini, openai, azure…",
      imageModel: "نموذج الصور (اختياري)",
      imageModelHint: "مثال: gemini-2.5-flash-image-preview أو gpt-image-1",
      imageDisabledHint: "يُمكّن توليد ملصقات مخصّصة عند تعيين كليهما ، وتتم مشاركة مفتاح النص",
      title: "إدارة الذكاء الاصطناعي",
      subtitle: "ضبط مزوّد ونموذج LessonForge دون إعادة تشغيل",
      superadminOnly: "هذه الصفحة متاحة لمدير النظام فقط",
      cardTitle: "إعدادات نموذج الذكاء الاصطناعي",
      provider: "المزوّد",
      providerHint: "gemini, openai, anthropic, groq, deepseek, azure…",
      model: "النموذج",
      modelHint: "مثال: gemini-2.5-flash أو gpt-4o-mini",
      apiKey: "مفتاح API",
      apiKeyPlaceholder: "اتركه فارغاً للاحتفاظ بالمفتاح الحالي",
      maxTokens: "الحد الأقصى لمخرجات الرموز",
      temperature: "درجة الحرارة",
      active: "النشط حالياً",
      save: "حفظ",
      saving: "جارٍ الحفظ...",
      test: "اختبار الاتصال",
      testing: "جارٍ الاختبار...",
      connected: (ms: number) => `✓ متصل (${ms}ms)`,
      testError: "فشل الاختبار",
      savedOk: "تم حفظ الإعدادات بنجاح",
      loadError: "تعذّر تحميل الإعدادات",
      retry: "إعادة المحاولة",
      keyHint: "سيتم عرض ••• عند وجود مفتاح مخزّن",
    },
    en: {
      imageProvider: "Image provider",
      imageProviderHint: "gemini, openai, azure…",
      imageModel: "Image model (optional)",
      imageModelHint: "e.g. gemini-2.5-flash-image-preview or gpt-image-1",
      imageDisabledHint: "Generates custom stickers when both are set; shares the text API key",
      title: "AI Management",
      subtitle: "Switch the LessonForge LLM provider/model at runtime",
      superadminOnly: "Superadmin access only",
      cardTitle: "AI Model Settings",
      provider: "Provider",
      providerHint: "gemini, openai, anthropic, groq, deepseek, azure…",
      model: "Model",
      modelHint: "e.g. gemini-2.5-flash or gpt-4o-mini",
      apiKey: "API key",
      apiKeyPlaceholder: "Leave blank to keep the existing key",
      maxTokens: "Max output tokens",
      temperature: "Temperature",
      active: "Currently active",
      save: "Save",
      saving: "Saving...",
      test: "Test connection",
      testing: "Testing...",
      connected: (ms: number) => `✓ Connected (${ms}ms)`,
      testError: "Test failed",
      savedOk: "Settings saved successfully",
      loadError: "Failed to load settings",
      retry: "Retry",
      keyHint: "••• is shown when a key is stored",
    },
  }[locale === "en" ? "en" : "ar"];

  const dir = isRtl ? "rtl" : "ltr";

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    setLoadErr(false);
    try {
      const res = await apiClient.get<AiConfigData>("/ai-management/config");
      const data = res.data;
      setConfig(data);
      setProvider(data.provider || "gemini");
      setModel(data.model || "");
      setApiKey("");
      setHasStoredKey(!!data.api_key);
      setMaxTokens(String(data.max_output_tokens ?? 32000));
      setTemperature(String(data.temperature ?? 0.7));
      setImageProvider(data.image_provider || "");
      setImageModel(data.image_model || "");
    } catch {
      setLoadErr(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) fetchConfig();
  }, [user, fetchConfig]);

  const buildPayload = useCallback(
    (includeKey: boolean) => {
      const cleanProvider = sanitizeInput(provider.trim()).toLowerCase();
      const cleanModel = sanitizeInput(model.trim());
      const payload: Record<string, unknown> = {
        provider: cleanProvider,
        model: cleanModel,
        max_output_tokens: Math.max(1, Math.floor(Number(maxTokens) || 32000)),
        temperature: Math.min(2, Math.max(0, Number(temperature) || 0.7)),
      };
      const cleanImgProvider = sanitizeInput(imageProvider.trim()).toLowerCase();
      const cleanImgModel = sanitizeInput(imageModel.trim());
      if (cleanImgProvider && cleanImgModel) {
        payload.image_provider = cleanImgProvider;
        payload.image_model = cleanImgModel;
      }
      if (includeKey) {
        const cleanKey = sanitizeInput(apiKey.trim());
        if (cleanKey) payload.api_key = cleanKey;
      }
      return payload;
    },
    [provider, model, apiKey, maxTokens, temperature, imageProvider, imageModel]
  );

  const handleSave = useCallback(async () => {
    setSaving(true);
    setMsg(null);
    try {
      await apiClient.put("/ai-management/config", buildPayload(true));
      await fetchConfig();
      setMsg({ kind: "ok", text: t.savedOk });
    } catch (e: any) {
      const detail = e?.response?.data?.detail || e?.message || t.testError;
      const msgText = Array.isArray(detail)
        ? detail.map((d: any) => d.msg || d.detail || JSON.stringify(d)).join(" · ")
        : String(detail);
      setMsg({ kind: "err", text: msgText });
    } finally {
      setSaving(false);
    }
  }, [buildPayload, fetchConfig, t]);

  const handleTest = useCallback(async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await apiClient.post<TestResponse>("/ai-management/test", buildPayload(true));
      if (res.data.ok) {
        const ms = res.data.latency_ms ?? 0;
        setTestResult({ ok: true, text: t.connected(ms) });
      } else {
        setTestResult({ ok: false, text: res.data.error || t.testError });
      }
    } catch (e: any) {
      const detail = e?.response?.data?.detail || e?.message || t.testError;
      const msgText = Array.isArray(detail)
        ? detail.map((d: any) => d.msg || d.detail || JSON.stringify(d)).join(" · ")
        : String(detail);
      setTestResult({ ok: false, text: msgText });
    } finally {
      setTesting(false);
    }
  }, [buildPayload, t]);

  if (!isSuperadmin) {
    return <AccessDenied message={t.superadminOnly} />;
  }

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto space-y-4 animate-pulse" dir={dir}>
        <div className="h-8 w-48 bg-slate-200 rounded" />
        <div className="card p-6 h-80" />
      </div>
    );
  }

  if (loadErr || !config) {
    return (
      <div className="max-w-3xl mx-auto text-center py-20" dir={dir}>
        <AlertCircle className="mx-auto text-red-400 mb-4" size={48} />
        <p className="text-red-500 font-medium mb-4">{t.loadError}</p>
        <button
          onClick={fetchConfig}
          className="px-4 py-2 text-sm font-medium rounded-lg bg-brand-500 text-white hover:bg-brand-600 transition-colors"
        >
          {t.retry}
        </button>
      </div>
    );
  }

  const currentlyActive = `${config.provider}/${config.model}`;

  return (
    <div className="max-w-3xl mx-auto space-y-6" dir={dir}>
      <div>
        <h1 className="text-xl font-bold text-slate-900">{t.title}</h1>
        <p className="text-sm text-slate-500">{t.subtitle}</p>
      </div>

      {msg && (
        <div
          className={`flex items-center gap-2 p-3 rounded-lg border text-sm ${
            msg.kind === "ok"
              ? "bg-emerald-50 border-emerald-200 text-emerald-700"
              : "bg-red-50 border-red-200 text-red-700"
          }`}
        >
          {msg.kind === "ok" ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          <span>{msg.text}</span>
          <button onClick={() => setMsg(null)} className="ms-auto opacity-60 hover:opacity-100">
            ×
          </button>
        </div>
      )}

      <div className="card p-6 space-y-5">
        <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
          <Cpu size={16} className="text-slate-400" />
          {t.cardTitle}
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-semibold text-slate-700">{t.provider}</label>
            <select
              value={KNOWN_PROVIDERS.includes(provider) ? provider : "custom"}
              onChange={(e) => {
                if (e.target.value === "custom") {
                  setProvider("");
                } else {
                  setProvider(e.target.value);
                }
              }}
              className="select-field mt-1"
            >
              {KNOWN_PROVIDERS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
              <option value="custom">— {isRtl ? "أخرى" : "Other"} —</option>
            </select>
            {!KNOWN_PROVIDERS.includes(provider) && (
              <input
                value={provider}
                onChange={(e) => setProvider(sanitizeInput(e.target.value))}
                placeholder={t.providerHint}
                className="input-field mt-2"
                dir="ltr"
              />
            )}
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700">{t.model}</label>
            <input
              value={model}
              onChange={(e) => setModel(sanitizeInput(e.target.value))}
              placeholder={t.modelHint}
              className="input-field mt-1"
              dir="ltr"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700">{t.imageProvider}</label>
            <input
              value={imageProvider}
              onChange={(e) => setImageProvider(sanitizeInput(e.target.value))}
              placeholder={t.imageProviderHint}
              className="input-field mt-1"
              dir="ltr"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700">{t.imageModel}</label>
            <input
              value={imageModel}
              onChange={(e) => setImageModel(sanitizeInput(e.target.value))}
              placeholder={t.imageModelHint}
              className="input-field mt-1"
              dir="ltr"
            />
            <p className="text-[11px] text-slate-400 mt-1">{t.imageDisabledHint}</p>
          </div>

          <div className="md:col-span-2">
            <label className="text-xs font-semibold text-slate-700">{t.apiKey}</label>
            <div className="relative mt-1">
              <input
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={hasStoredKey ? t.apiKeyPlaceholder : ""}
                className="input-field w-full pe-10"
                dir="ltr"
                autoComplete="off"
              />
              {hasStoredKey && !apiKey && (
                <span className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-sm text-slate-400 tracking-widest">
                  {API_KEY_MASK}
                </span>
              )}
              <button
                type="button"
                onClick={() => setShowKey((v) => !v)}
                className="absolute end-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                tabIndex={-1}
              >
                {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <p className="text-[11px] text-slate-400 mt-1">{t.apiKeyPlaceholder}</p>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700">{t.maxTokens}</label>
            <input
              type="number"
              min={256}
              max={128000}
              value={maxTokens}
              onChange={(e) => setMaxTokens(sanitizeInput(e.target.value))}
              className="input-field mt-1"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700">{t.temperature}</label>
            <input
              type="number"
              min={0}
              max={2}
              step={0.1}
              value={temperature}
              onChange={(e) => setTemperature(sanitizeInput(e.target.value))}
              className="input-field mt-1"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-primary inline-flex items-center gap-2"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {saving ? t.saving : t.save}
          </button>
          <button
            onClick={handleTest}
            disabled={testing}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition-colors disabled:opacity-60"
          >
            {testing ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
            {testing ? t.testing : t.test}
          </button>

          {testResult && (
            <span
              className={`badge ${testResult.ok ? "badge-success" : "badge-muted"}`}
            >
              {testResult.ok ? (
                <CheckCircle2 size={12} className="me-1" />
              ) : (
                <AlertCircle size={12} className="me-1" />
              )}
              {testResult.text}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 text-sm text-slate-500">
        <span>{t.active}:</span>
        <code className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-xs font-mono" dir="ltr">
          {currentlyActive}
        </code>
        {hasStoredKey && (
          <span className="text-[11px] text-slate-400">({t.keyHint})</span>
        )}
      </div>
    </div>
  );
}
