# Frontend Design Rules: "Professional Minimalist"

This document establishes the high-level design language and visual system direction for the Frontend team building the LIMS (Institute Management System) Portal. The aesthetic goal is a modern, high-quality, professional SaaS feel (similar to Vercel, Stripe, or Tailwind UI) that prioritizes legibility, subtle color choices, and minimal eye strain.

## 1. Design Aesthetic & Theme
- **Style**: Flat design with very soft box-shadows and smooth rounded corners (12px to 16px, `rounded-xl` in Tailwind) to separate cards and modules.
- **Background & Canvases**: The app operates in a pure light mode.
  - Main background: Very light gray/slate (`#F8FAFC` or `slate-50`).
  - Cards & Containers: Pure White (`#FFFFFF`).
  - Borders: Thin, crisp light-gray borders (`#E2E8F0` or `slate-200`) for structural separation.
- **Dark Mode**: Explicitly unsupported at this phase to ensure a clean, debt-free CSS architecture. 

## 2. Color Palette & Semantics
- **Primary Text**: Deep charcoal/slate (`#0F172A` or `slate-900`) for high readability.
- **Secondary Text**: Soft slate (`#475569` or `slate-600`) for helper text, descriptions, and labels.
- **Brand/Primary (`brand-500`)**: Deep Sapphire / Indigo Blue (`#1E3A8A`). Used for core interactions, primary buttons, and active links to convey authority and trust.
- **AI/Accent (`ai-500`)**: Teal / Emerald (`#0D9488`). Strictly reserved for AI features, curriculum processing widgets, generating status bars, and magic buttons.
- **Status Colors**:
  - Success: Emerald Green (`#10B981`)
  - Warning: Warm Amber (`#F59E0B`)
  - Danger: Rose/Crimson Red (`#EF4444`)

## 3. Typography & Bilingual Handling
- **Fonts**: 
  - English: **Inter** (or Plus Jakarta Sans).
  - Arabic: **IBM Plex Sans Arabic** or **Cairo**.
- **Bilingual Typography Handling**: 
  > **IMPORTANT**: Arabic text inherently requires more vertical breathing room than Latin scripts. When rendering Arabic interfaces, ensure that line heights (`leading-relaxed`) are padded slightly more generously compared to English. This ensures Arabic data tables and list items remain highly legible and do not feel cramped.
- **Hierarchy**: 
  - Titles: Crisp, dark, and bold (`font-bold`).
  - Metrics: Large, clean numbers (`text-3xl font-semibold`).

## 4. Components & Interactive Elements
- **Cards**: Use the global `.card` class defined in `globals.css` (`bg-white shadow-sm border border-slate-200 rounded-xl`) for consistent container styling.
- **Data Tables**:
  - Comfortable padding (`py-3` or `py-4`) so large lists are easily scannable.
  - Headers: Subtle gray fill background (`slate-100`) with uppercase, muted small text.
  - Rows: White rows with subtle bottom borders and a very soft tint on hover (`hover:bg-slate-50`).
- **Badges**: Pill-shaped with low-saturation backgrounds and high-saturation text (e.g., light green background with dark green text).
- **Forms & Inputs**: Clean light gray borders that transition to a crisp Sapphire outline on `:focus`. Muted placeholders.
- **Icons**: Strictly use **Lucide Icons** (`lucide-react`) at the default outline weight (`strokeWidth={2}`). **Never** mix filled and outlined styles in the same viewport.
- **AI Loading States**: Avoid standard spinner wheels. Use sleek skeleton loaders paired with a smooth glowing gradient animation pulsing between Sapphire and Teal.
