"use client";

import { apiClient } from "@/lib/api";

export type PromoLocale = "ar" | "en";
export type PromoTone = "cinematic" | "clean";
export type PromoQuality = "draft" | "high";

export interface ScheduleRow { time: string; title: string; meta: string }
export interface ProgramCard { tag: string; name: string; badge: string; desc: string; seats: string }
export interface StatItem { value: string; label: string }

export interface PromoPayload {
  heroL1: string; heroL2: string; heroL3: string; cta: string;
  kicker: string; micro: string;
  rows: ScheduleRow[]; cards: ProgramCard[]; stats: StatItem[];
  program_slug?: string; custom_course: boolean;
}

export interface PromoProject {
  id: string; type: string; locale: PromoLocale; tone: PromoTone;
  payload: PromoPayload; status: string; created_at?: string; updated_at?: string;
}

export interface PromoRender {
  id: string; project_id: string; quality: PromoQuality;
  template_version: string; brand_kit_version: number;
  mp4_url: string | null; poster_url: string | null;
  share_copy: string | null; duration_s: number | null;
  render_ms: number | null; status: string; error: string | null;
  progress: number | null; created_at?: string;
}

export const LIMITS = {
  heroL1: 24, heroL2: 32, heroL3: 28, cta: 26,
  kicker: 60, micro: 80,
  rowTitle: 34, rowMeta: 60, rowTime: 8,
  cardName: 20, cardDesc: 60, cardTag: 16, cardBadge: 20, cardSeats: 20,
  statValue: 12, statLabel: 20,
  rows: 3, cards: 4, stats: 3,
} as const;

export function countChars(s: string): number {
  return Array.from(s || "").length;
}

export function overLimit(value: string, max: number): boolean {
  return countChars(value) > max;
}

export function validatePayload(p: PromoPayload): Record<string, string> {
  const errors: Record<string, string> = {};
  const check = (key: string, value: string, max: number) => {
    if (!value || !value.trim()) errors[key] = "required";
    else if (overLimit(value, max)) errors[key] = `max ${max} chars`;
  };
  check("heroL1", p.heroL1, LIMITS.heroL1);
  check("heroL2", p.heroL2, LIMITS.heroL2);
  check("heroL3", p.heroL3, LIMITS.heroL3);
  check("cta", p.cta, LIMITS.cta);
  if (overLimit(p.kicker, LIMITS.kicker)) errors.kicker = `max ${LIMITS.kicker} chars`;
  if (overLimit(p.micro, LIMITS.micro)) errors.micro = `max ${LIMITS.micro} chars`;
  if (p.rows.length > LIMITS.rows) errors.rows = `max ${LIMITS.rows} rows`;
  p.rows.forEach((r, i) => {
    if (overLimit(r.time, LIMITS.rowTime)) errors[`rows.${i}.time`] = `max ${LIMITS.rowTime} chars`;
    if (overLimit(r.title, LIMITS.rowTitle)) errors[`rows.${i}.title`] = `max ${LIMITS.rowTitle} chars`;
    if (overLimit(r.meta, LIMITS.rowMeta)) errors[`rows.${i}.meta`] = `max ${LIMITS.rowMeta} chars`;
  });
  if (p.cards.length > LIMITS.cards) errors.cards = `max ${LIMITS.cards} cards`;
  p.cards.forEach((c, i) => {
    if (overLimit(c.tag, LIMITS.cardTag)) errors[`cards.${i}.tag`] = `max ${LIMITS.cardTag} chars`;
    if (overLimit(c.name, LIMITS.cardName)) errors[`cards.${i}.name`] = `max ${LIMITS.cardName} chars`;
    if (overLimit(c.badge, LIMITS.cardBadge)) errors[`cards.${i}.badge`] = `max ${LIMITS.cardBadge} chars`;
    if (overLimit(c.desc, LIMITS.cardDesc)) errors[`cards.${i}.desc`] = `max ${LIMITS.cardDesc} chars`;
    if (overLimit(c.seats, LIMITS.cardSeats)) errors[`cards.${i}.seats`] = `max ${LIMITS.cardSeats} chars`;
  });
  if (p.stats.length > LIMITS.stats) errors.stats = `max ${LIMITS.stats} stats`;
  p.stats.forEach((s, i) => {
    if (overLimit(s.value, LIMITS.statValue)) errors[`stats.${i}.value`] = `max ${LIMITS.statValue} chars`;
    if (overLimit(s.label, LIMITS.statLabel)) errors[`stats.${i}.label`] = `max ${LIMITS.statLabel} chars`;
  });
  return errors;
}

function trunc(s: string, max: number): string {
  // Codepoint-safe truncation (never splits emoji), mirroring countChars.
  const chars = Array.from(s || "");
  return chars.length > max ? chars.slice(0, max).join("") : s;
}

export function defaultPayloadForProgram(program: any, locale: PromoLocale): PromoPayload {
  const k = program?.k || program?.name || "";
  const d = program?.d || program?.desc || "";
  const meta = program?.meta || "";
  const seats = program?.seats || "";
  const heroFallback = locale === "ar"
    ? { heroL1: "تعلمها", heroL2: "بذكاء اصطناعي", heroL3: "وأتقنها من أول يوم", cta: "احجز مقعدك المجاني ←", kicker: "دورة جديدة · تسجيل مفتوح", micro: "حضوري · اختبار تحديد مجاني · ٨ طلاب فقط" }
    : { heroL1: "Learn it", heroL2: "with AI", heroL3: "ship it same day.", cta: "Book free trial →", kicker: "New course · Open enrolment", micro: "On-campus · Free placement test · 8 max" };
  return {
    ...heroFallback,
    rows: [
      { time: "08", title: trunc(String(k || "English B1 — Room A"), LIMITS.rowTitle), meta: trunc(String(meta || "Ms. Layla · 8 students"), LIMITS.rowMeta) },
      { time: "11", title: trunc("Python Basics — Lab 2", LIMITS.rowTitle), meta: "Eng. Karam · Live code" },
      { time: "15", title: trunc("Accounting I — Room C", LIMITS.rowTitle), meta: "Ms. Sara · hands-on" },
    ],
    cards: [
      { tag: trunc("LINGUA", LIMITS.cardTag), name: trunc(String(k || "Languages"), LIMITS.cardName), badge: trunc(String(meta || "A1 → C2"), LIMITS.cardBadge), desc: trunc(String(d || "Daily conversation lab."), LIMITS.cardDesc), seats: trunc(String(seats || "8 seats left"), LIMITS.cardSeats) },
    ],
    stats: [
      { value: "12k+", label: "graduates" },
      { value: "4.8/5", label: "rating" },
      { value: "8", label: "max/class" },
    ],
    program_slug: program?.id || undefined,
    custom_course: false,
  };
}

export function blankPayload(locale: PromoLocale): PromoPayload {
  return defaultPayloadForProgram(null, locale);
}

// ── API wrappers ────────────────────────────────────────────────

export async function createPromoProject(input: { locale: PromoLocale; tone: PromoTone; payload: PromoPayload }): Promise<PromoProject> {
  const res = await apiClient.post("/promo/projects", { type: "course", ...input });
  return res.data as PromoProject;
}

export async function updatePromoProject(id: string, input: { locale?: PromoLocale; tone?: PromoTone; payload?: PromoPayload }): Promise<PromoProject> {
  const res = await apiClient.put(`/promo/projects/${id}`, input);
  return res.data as PromoProject;
}

export async function listPromoProjects(page = 1, perPage = 20): Promise<{ items: PromoProject[]; total: number }> {
  const res = await apiClient.get("/promo/projects", { params: { mine: 1, page, per_page: perPage } });
  return res.data;
}

export async function getPromoProject(id: string): Promise<{ project: PromoProject; renders: PromoRender[] }> {
  const res = await apiClient.get(`/promo/projects/${id}`);
  return res.data;
}

export async function requestPromoRender(projectId: string, quality: PromoQuality): Promise<{ render_id: string; status: string }> {
  const res = await apiClient.post(`/promo/projects/${projectId}/render?quality=${quality}`, {});
  return res.data;
}

export async function getPromoRender(renderId: string): Promise<PromoRender> {
  const res = await apiClient.get(`/promo/renders/${renderId}`);
  return res.data as PromoRender;
}

export async function getPromoQuota(): Promise<{ used: number; limit: number; reset_at: string }> {
  const res = await apiClient.get("/promo/quota");
  return res.data;
}
