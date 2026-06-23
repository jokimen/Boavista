import { cn } from "@/lib/utils";

interface BadgeProps {
  children: React.ReactNode;
  variant?: "default" | "success" | "warning" | "danger" | "info" | "outline";
  className?: string;
}

const variantStyles = {
  default: "bg-border text-text-primary",
  success: "bg-success-bg text-[#10b981]",
  warning: "bg-warning-bg text-[#f59e0b]",
  danger: "bg-danger-bg text-[#ef4444]",
  info: "bg-border-subtle text-[#3b82f6]",
  outline: "border border-border-subtle text-text-secondary bg-transparent",
};

export function Badge({ children, variant = "default", className }: BadgeProps) {
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded text-xs font-medium", variantStyles[variant], className)}>
      {children}
    </span>
  );
}
