# course-ad-v1 assets

Template-locked brand assets. The wizard exposes no controls over these.

## Music (2 tracks)

- `music/track-cinematic.mp3` — slow, spacious bed for the `cinematic` tone.
- `music/track-clean.mp3` — upbeat bed for the `clean` tone.

> LICENSE RISK (plan §11.1): the two demo tracks currently bundled are
> placeholders whose commercial terms are unclear. Marketing must replace both
> with 2 licensed AR-friendly tracks before any public post. The worker's
> `data-var-src` fallback (tone default) keeps working after the swap with no
> code change — just overwrite these two files.

## SFX

Motion-matched accents (moderate posture, 0.55–0.85 volume, never stacked over
unreadable text): `bong_001` (hook lift), `card-slide-1` (schedule rows),
`impactSoft_medium_001` (program grid), `click_003` (CTA tap),
`impactBell_heavy_000` (outro payoff, sparse in cinematic).

## Fonts

- `fonts/arabic-display.woff2` — **NOT YET BUNDLED.** Ship one OFL/licensed
  Arabic display face here before public posts (plan §11.2: IBM Plex Sans
  Arabic OFL or Noto Kufi Arabic OFL both solve it cleanly). The template's
  `@font-face` falls back to Inter/Arial until then — Arabic still renders,
  just not in the final display cut.
- Latin body: Inter (auto-resolved at render time).

## Logo

- `brand/logo.svg` + `brand/logo-ar.svg` — fixed outro lockup (560×160,
  every ad, fixed position/size). Rebrand = replace these two files.
