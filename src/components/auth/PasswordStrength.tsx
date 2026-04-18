import { useMemo } from "react";

export interface StrengthResult {
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
  color: string;
}

export function scorePassword(pw: string): StrengthResult {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  // Cap at 4
  const capped = Math.min(score, 4) as 0 | 1 | 2 | 3 | 4;
  const labels = ["Too weak", "Weak", "Fair", "Strong", "Excellent"];
  const colors = [
    "bg-destructive",
    "bg-destructive",
    "bg-amber-500",
    "bg-neon-cyan",
    "bg-emerald-500",
  ];
  return { score: capped, label: labels[capped], color: colors[capped] };
}

export function PasswordStrength({ password }: { password: string }) {
  const { score, label, color } = useMemo(() => scorePassword(password), [password]);
  if (!password) return null;
  return (
    <div className="space-y-1.5">
      <div className="flex gap-1">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-colors ${i < score ? color : "bg-border"}`}
          />
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground flex justify-between">
        <span>Strength: <span className="font-medium text-foreground">{label}</span></span>
        {score < 3 && password.length > 0 && (
          <span className="text-muted-foreground/80">Use 12+ chars, mix cases, numbers, symbols</span>
        )}
      </p>
    </div>
  );
}
