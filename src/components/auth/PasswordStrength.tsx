import { useMemo } from "react";
import { scorePassword } from "@/lib/password-strength";

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
        <span>
          Strength: <span className="font-medium text-foreground">{label}</span>
        </span>
        {score < 3 && password.length > 0 && (
          <span className="text-muted-foreground/80">
            Use 12+ chars, mix cases, numbers, symbols
          </span>
        )}
      </p>
    </div>
  );
}
