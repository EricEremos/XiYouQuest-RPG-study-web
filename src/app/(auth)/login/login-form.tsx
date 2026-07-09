"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, AlertCircle } from "lucide-react";

import { authClient } from "@/lib/auth-client";

// HKUST SSO is the only sign-in method. providerId "hkust" matches the
// redirect URI registered on the Entra app (see docs/oidc-redirect-uris.md).
const HKUST_PROVIDER_ID = "hkust";

export function LoginForm() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleHkustSignIn() {
    setLoading(true);
    setError(null);
    try {
      const { error: signInError } = await authClient.signIn.oauth2({
        providerId: HKUST_PROVIDER_ID,
        callbackURL: "/dashboard",
      });
      if (signInError) {
        setError(signInError.message ?? "HKUST sign-in failed. Please try again.");
        setLoading(false);
      }
      // On success the browser is navigating to Microsoft — keep the spinner.
    } catch {
      setError("Couldn't reach the HKUST sign-in service. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-md pixel-border chinese-corner bg-card p-6 space-y-6">
      <div className="text-center space-y-2">
        <h2 className="font-pixel text-base text-primary pixel-glow">Continue</h2>
        <p className="text-muted-foreground">
          Sign in with your HKUST account to begin.
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-2 border-2 border-destructive bg-destructive/10 p-3">
          <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      <Button
        type="button"
        className="w-full"
        onClick={handleHkustSignIn}
        disabled={loading}
        aria-busy={loading || undefined}
      >
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Redirecting…
          </>
        ) : (
          "Sign in with HKUST"
        )}
      </Button>

      <p className="text-center text-xs text-muted-foreground">
        Use your @ust.hk or @connect.ust.hk account.
      </p>
    </div>
  );
}
