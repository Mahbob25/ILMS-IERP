"use client";

import React, { useCallback, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";

interface RefreshButtonProps {
  onRefresh?: () => Promise<void>;
  className?: string;
  size?: number;
  tooltip?: string;
}

export default function RefreshButton({
  onRefresh,
  className = "",
  size = 16,
  tooltip = "Refresh data",
}: RefreshButtonProps) {
  const [spinning, setSpinning] = useState(false);
  const lastClick = useRef(0);

  const handleClick = useCallback(async () => {
    const now = Date.now();
    if (now - lastClick.current < 500) return;
    lastClick.current = now;

    setSpinning(true);
    try {
      if (onRefresh) {
        await onRefresh();
      } else {
        window.location.reload();
      }
    } finally {
      setSpinning(false);
    }
  }, [onRefresh]);

  return (
    <button
      onClick={handleClick}
      disabled={spinning}
      className={`btn-icon ${className}`}
      title={tooltip}
    >
      <RefreshCw size={size} className={spinning ? "animate-spin" : ""} />
    </button>
  );
}
