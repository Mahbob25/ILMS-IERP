"use client";

import React from "react";

interface SkeletonProps {
  className?: string;
}

/**
 * Simple animated placeholder block (skeleton loading). Combine several with
 * different widths/heights to shape a loading layout.
 */
export default function Skeleton({ className = "" }: SkeletonProps) {
  return <div className={`animate-pulse bg-slate-100 rounded-lg ${className}`} />;
}
