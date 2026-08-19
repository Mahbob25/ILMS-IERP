"use client";

/**
 * Animated illustration for the login loading state: a modern anime-style
 * student opening a glowing book — "preparing the session". Pure inline SVG
 * (no external assets), colored from the marketing brand palette, and driven
 * by the Tailwind `loading-*` keyframes (all `motion-reduce` safe).
 */
export default function LoginLoadingIllustration() {
  return (
    <svg
      viewBox="0 0 128 128"
      className="h-28 w-28"
      aria-hidden="true"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <radialGradient id="loadingBookGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#FFD60A" stopOpacity="0.9" />
          <stop offset="55%" stopColor="#FFD60A" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#FFD60A" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Soft ambient halo behind the figure */}
      <circle
        cx="64"
        cy="66"
        r="40"
        fill="url(#loadingBookGlow)"
        className="animate-loading-halo motion-reduce:animate-none"
      />

      {/* Orbiting "connecting" dots around the figure */}
      <g
        className="animate-loading-orbit motion-reduce:animate-none"
        style={{ transformOrigin: "64px 64px" }}
      >
        <circle cx="100" cy="30" r="3.5" fill="#0EA5E9" opacity="0.85" />
        <circle cx="26" cy="96" r="3" fill="#FFD60A" opacity="0.85" />
      </g>

      {/* Character — gentle float bob */}
      <g className="animate-loading-float motion-reduce:animate-none">
        {/* Hair (ink, anime swoosh highlight) */}
        <path
          d="M50 48.5C51.5 41.5 56.5 37 64 37C71.5 37 76.5 41.5 78 48.5C79.5 44.5 84 43.5 88 47C88.5 52 86.5 58 84.5 61.5C81 55.5 76 53.5 70.5 53.5C65 53.5 60 55 56 58.5C54.5 55 52.5 51.5 50 48.5Z"
          fill="#0A0A0A"
        />
        <path
          d="M56 39.5C59.5 37.5 64 36.5 68 37C62 35 55.5 37 52 41C52.5 40.5 53.5 40 56 39.5Z"
          fill="#4A4A4A"
          opacity="0.85"
        />

        {/* Face */}
        <circle cx="64" cy="55" r="13.5" fill="#FFE3C2" stroke="#0A0A0A" strokeWidth="2.5" />
        {/* Eyes */}
        <circle cx="59" cy="55" r="1.8" fill="#0A0A0A" />
        <circle cx="69" cy="55" r="1.8" fill="#0A0A0A" />
        {/* Blush */}
        <circle cx="54.5" cy="59.5" r="2.2" fill="#FFB3A5" opacity="0.6" />
        <circle cx="73.5" cy="59.5" r="2.2" fill="#FFB3A5" opacity="0.6" />

        {/* Body — school top */}
        <path
          d="M50.5 67.5C50.5 60.5 56.5 55 64 55C71.5 55 77.5 60.5 77.5 67.5V86.5C77.5 89 75.5 91 73 91H55C52.5 91 50.5 89 50.5 86.5V67.5Z"
          fill="#6366F1"
          stroke="#0A0A0A"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        {/* Neck */}
        <rect x="60.5" y="52" width="7" height="5" rx="2" fill="#FFE3C2" stroke="#0A0A0A" strokeWidth="2" />

        {/* Red bow accent */}
        <path
          d="M64 67.5C59.5 65 55.5 65.5 53 67.5C56.5 70 60 70.5 64 69C68 70.5 71.5 70 75 67.5C72.5 65.5 68.5 65 64 67.5Z"
          fill="#FF3B30"
          stroke="#0A0A0A"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />

        {/* Arms */}
        <path
          d="M50.5 74C46 77 44 81 43.5 84.5C47 86 50.5 86 53 85.5"
          fill="#6366F1"
          stroke="#0A0A0A"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        <path
          d="M77.5 74C82 77 84 81 84.5 84.5C81 86 77.5 86 75 85.5"
          fill="#6366F1"
          stroke="#0A0A0A"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />

        {/* Open book at chest level — glowing centerpiece */}
        <g>
          <path
            d="M38 72.5C38 67 42 62.5 46.5 61C47.5 60.5 49 60.5 50 61.5C51.5 63 52.5 65 52.5 67.5V88C52.5 89.5 51.5 90.5 50 90.5C46 90 42 86 38 79V72.5Z"
            fill="#0A0A0A"
            stroke="#0A0A0A"
            strokeWidth="1"
            strokeLinejoin="round"
          />
          <path
            d="M90 72.5C90 67 86 62.5 81.5 61C80.5 60.5 79 60.5 78 61.5C76.5 63 75.5 65 75.5 67.5V88C75.5 89.5 76.5 90.5 78 90.5C82 90 86 86 90 79V72.5Z"
            fill="#0A0A0A"
            stroke="#0A0A0A"
            strokeWidth="1"
            strokeLinejoin="round"
          />
          {/* Book spine/gutter */}
          <path d="M52.5 62.5V88" stroke="#0A0A0A" strokeWidth="2.5" strokeLinecap="round" />
          {/* Glow core between the pages */}
          <ellipse cx="64" cy="76" rx="7.5" ry="10.5" fill="#FFD60A" className="animate-loading-halo motion-reduce:animate-none" />
          {/* Page hints */}
          <path d="M41 69C44 66.5 47 65.5 50 65.5" stroke="#FFFBF0" strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />
          <path d="M41 74.5C44 72 47 71 50 71" stroke="#FFFBF0" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
          <path d="M78 65.5C81 65.5 84 66.5 87 69" stroke="#FFFBF0" strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />
          <path d="M78 71C81 71 84 72 87 74.5" stroke="#FFFBF0" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
        </g>
      </g>

      {/* Twinkling sparkles */}
      <g className="animate-loading-twinkle motion-reduce:animate-none" style={{ transformOrigin: "28px 34px" }}>
        <path
          d="M28 28L30 34L36 36L30 38L28 44L26 38L20 36L26 34L28 28Z"
          fill="#FFD60A"
        />
      </g>
      <g className="animate-loading-twinkle motion-reduce:animate-none" style={{ transformOrigin: "100px 96px", animationDelay: "0.45s" }}>
        <path
          d="M100 92L101.5 96.5L106 98L101.5 99.5L100 104L98.5 99.5L94 98L98.5 96.5L100 92Z"
          fill="#0EA5E9"
        />
      </g>
      <g className="animate-loading-twinkle motion-reduce:animate-none" style={{ transformOrigin: "100px 30px", animationDelay: "0.9s" }}>
        <circle cx="100" cy="30" r="2" fill="#FFD60A" />
      </g>
    </svg>
  );
}
