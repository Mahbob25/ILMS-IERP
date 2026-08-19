import React from "react";

export default function TableContainer({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`overflow-x-auto overscroll-x-contain touch-pan-x [&>table]:min-w-[640px] ${className}`}
      style={{ WebkitOverflowScrolling: "touch" } as unknown as React.CSSProperties}
    >
      {children}
    </div>
  );
}
