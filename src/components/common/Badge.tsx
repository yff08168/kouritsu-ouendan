import { cn } from "@/lib/utils";

type Props = {
  children: React.ReactNode;
  /** accent は「甲子園出場決定」など特に目立たせたいものだけに使う */
  variant?: "accent" | "navy" | "outline";
  className?: string;
};

export function Badge({ children, variant = "navy", className }: Props) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-1.5 py-0.5 text-[0.6875rem] font-bold leading-tight",
        // オレンジ地に白文字は 2.45:1 しかない。濃紺文字にすると 7.13:1 になり、
        // オレンジの鮮やかさも保てる
        variant === "accent" && "bg-accent-500 text-navy-900",
        variant === "navy" && "bg-navy-100 text-navy-800",
        variant === "outline" && "border border-line text-ink-muted",
        className,
      )}
    >
      {children}
    </span>
  );
}
