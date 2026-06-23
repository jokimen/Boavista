"use client";

import { cn } from "@/lib/utils";

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  className?: string;
}

export function Select({ options, value, onChange, placeholder, label, className }: SelectProps) {
  return (
    <div className="w-full">
      {label && <label className="block text-sm font-medium text-text-secondary mb-1.5">{label}</label>}
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className={cn(
          "w-full bg-border border border-border-subtle rounded-lg text-text-primary",
          "px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#3b82f6]/50 focus:border-[#3b82f6]",
          "transition-colors cursor-pointer",
          className
        )}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  );
}
