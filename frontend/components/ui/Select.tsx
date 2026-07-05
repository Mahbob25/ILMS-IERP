"use client";

import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { ChevronDown, Search } from "lucide-react";

interface SelectOption {
  value: string | number;
  label: string;
}

interface SelectProps {
  options: SelectOption[];
  value: string | number;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  error?: string;
  disabled?: boolean;
  className?: string;
  isRtl?: boolean;
  searchable?: boolean;
  searchPlaceholder?: string;
}

export default function Select({
  options,
  value,
  onChange,
  placeholder,
  label,
  error,
  disabled = false,
  className = "",
  isRtl = false,
  searchable = true,
  searchPlaceholder,
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const selectedOption = options.find((o) => o.value === value);
  const displayText = selectedOption?.label ?? placeholder ?? "";

  const filteredOptions = useMemo(() => {
    if (!search) return options;
    const q = search.toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, search]);

  const handleToggle = useCallback(() => {
    if (!disabled) {
      const next = !open;
      setOpen(next);
      if (!next) setSearch("");
    }
  }, [disabled, open]);

  const handleSelect = useCallback(
    (option: SelectOption) => {
      onChange(String(option.value));
      setOpen(false);
      setSearch("");
    },
    [onChange]
  );

  useEffect(() => {
    if (open) {
      setSearch("");
      setHighlightedIndex(-1);
      setTimeout(() => searchInputRef.current?.focus(), 0);
    }
  }, [open]);

  useEffect(() => {
    if (!open || !listRef.current || highlightedIndex < 0) return;
    const item = listRef.current.children[highlightedIndex] as HTMLElement | undefined;
    item?.scrollIntoView({ block: "nearest" });
  }, [highlightedIndex, open]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleTriggerKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
        e.preventDefault();
        setOpen(true);
        return;
      }
      if (/^[a-zA-Z0-9]$/.test(e.key)) {
        setOpen(true);
        setSearch(e.key);
        return;
      }
    },
    []
  );

  const handleSearchKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setHighlightedIndex((prev) =>
            prev < filteredOptions.length - 1 ? prev + 1 : 0
          );
          break;
        case "ArrowUp":
          e.preventDefault();
          setHighlightedIndex((prev) =>
            prev > 0 ? prev - 1 : filteredOptions.length - 1
          );
          break;
        case "Enter":
          e.preventDefault();
          if (
            highlightedIndex >= 0 &&
            highlightedIndex < filteredOptions.length
          ) {
            handleSelect(filteredOptions[highlightedIndex]);
          }
          break;
        case "Escape":
          e.preventDefault();
          setOpen(false);
          setSearch("");
          break;
      }
    },
    [filteredOptions, highlightedIndex, handleSelect]
  );

  const highlightMatch = (text: string) => {
    if (!search) return text;
    const q = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`(${q})`, "gi");
    const parts = text.split(regex);
    return parts.map((part, i) =>
      regex.test(part) ? (
        <mark key={i} className="bg-amber-200/60 text-inherit rounded-sm px-0.5">
          {part}
        </mark>
      ) : (
        part
      )
    );
  };

  const listHeight = Math.min(filteredOptions.length * 36 + 4, 240);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {label && (
        <label className="block text-xs font-medium text-slate-700 mb-1">
          {label}
        </label>
      )}
      <button
        type="button"
        onClick={handleToggle}
        onKeyDown={handleTriggerKeyDown}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        dir={isRtl ? "rtl" : "ltr"}
        className={`w-full text-sm px-3 py-2 rounded-lg bg-white border transition-all duration-150 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-slate-50 ${
          error
            ? "border-red-400 focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
            : "border-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
        } ${open ? "ring-2 ring-brand-500/20 border-brand-500" : ""}`}
      >
        <span
          className={`flex-1 text-start truncate ${
            selectedOption ? "text-slate-900" : "text-slate-400"
          }`}
        >
          {displayText}
        </span>
        <ChevronDown
          size={16}
          className={`text-slate-400 shrink-0 transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
      {open && (
        <div
          className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden"
          style={{ top: "100%" }}
        >
          {searchable && (
            <div className="relative border-b border-slate-200">
              <Search
                size={14}
                className={`absolute top-1/2 -translate-y-1/2 text-slate-400 ${
                  isRtl ? "right-3" : "left-3"
                }`}
              />
              <input
                ref={searchInputRef}
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setHighlightedIndex(-1);
                }}
                onKeyDown={handleSearchKeyDown}
                placeholder={searchPlaceholder || placeholder || ""}
                dir={isRtl ? "rtl" : "ltr"}
                className={`w-full text-sm py-2 border-0 focus:outline-none bg-transparent ${
                  isRtl ? "pr-9 pl-3" : "pl-9 pr-3"
                }`}
              />
            </div>
          )}
          <ul
            ref={listRef}
            role="listbox"
            dir={isRtl ? "rtl" : "ltr"}
            className={`overflow-auto py-1 ${
              isRtl ? "text-right" : "text-left"
            }`}
            style={{ maxHeight: listHeight }}
          >
            {filteredOptions.length === 0 ? (
              <li className="px-3 py-2 text-sm text-slate-400">
                {searchable && search ? "No results" : "No options"}
              </li>
            ) : (
              filteredOptions.map((option, index) => (
                <li
                  key={option.value}
                  role="option"
                  aria-selected={option.value === value}
                  onClick={() => handleSelect(option)}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  className={`px-3 py-2 text-sm cursor-pointer transition-colors ${
                    option.value === value
                      ? "bg-brand-50 text-brand-700 font-medium"
                      : index === highlightedIndex
                        ? "bg-slate-100 text-slate-900"
                        : "text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {searchable && search
                    ? highlightMatch(option.label)
                    : option.label}
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
