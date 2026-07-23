import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";

interface LoginFormProps {
  error?: string;
}

export function LoginForm({ error }: LoginFormProps) {
  const errorMessage =
    error === "sso_unavailable"
      ? "HKUST sign-in is temporarily unavailable. Please try again."
      : null;

  return (
    <div className="w-full min-w-0 space-y-6 bg-card p-4 pixel-border chinese-corner sm:p-6">
      <div className="text-center space-y-2">
        <h2 className="font-pixel text-base text-primary pixel-glow">Continue</h2>
        <p className="text-muted-foreground">
          Sign in with your HKUST account to begin.
        </p>
      </div>

      {errorMessage && (
        <div className="flex items-start gap-2 border-2 border-destructive bg-destructive/10 p-3">
          <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
          <p className="text-sm text-destructive">{errorMessage}</p>
        </div>
      )}

      <Button asChild className="w-full">
        <a href="/auth/hkust">Sign in with HKUST</a>
      </Button>

      <p className="text-center text-xs text-muted-foreground">
        Use your @ust.hk or @connect.ust.hk account.
      </p>
    </div>
  );
}
