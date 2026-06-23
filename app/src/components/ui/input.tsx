import { cn } from "@/lib/utils";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  leftIcon?: React.ReactNode;
}

export function Input({ label, error, leftIcon, className, id, ...props }: InputProps) {
  return (
    <div className="w-full">
      {label && (
        <label htmlFor={id} className="block text-sm font-medium text-text-secondary mb-1.5">
          {label}
        </label>
      )}
      <div className="relative">
        {leftIcon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted">
            {leftIcon}
          </div>
        )}
        <input
          id={id}
          className={cn(
            "w-full bg-border border border-border-subtle rounded-lg text-text-primary placeholder-text-muted",
            "focus:outline-none focus:ring-2 focus:ring-[#3b82f6]/50 focus:border-[#3b82f6]",
            "transition-colors",
            leftIcon ? "pl-9 pr-3 py-2.5" : "px-3 py-2.5",
            "text-sm",
            error && "border-[#ef4444] focus:ring-[#ef4444]/50",
            className
          )}
          {...props}
        />
      </div>
      {error && <p className="mt-1 text-xs text-[#ef4444]">{error}</p>}
    </div>
  );
}
