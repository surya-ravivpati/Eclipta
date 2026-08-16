import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "@/i18n/use-translation";
import { readConsent, recordConsent, type ConsentChoice } from "@/lib/consent";

/**
 * Cookie / storage consent.
 *
 * Two rules this respects that most banners break:
 *
 *  1. **Reject is as easy as accept.** Under GDPR Art. 7(3) and the EDPB's
 *     guidance, consent is not freely given if refusing takes more effort than
 *     agreeing. So both are one click, side by side, with equal visual weight -
 *     no "manage preferences" maze on the reject path.
 *  2. **Nothing non-essential is stored before a choice is made.** The banner
 *     itself records the decision in localStorage, which is strictly necessary
 *     for the banner to stop reappearing, and is permitted on that basis.
 *
 * Dismissing without choosing is not treated as consent - the banner stays.
 */

export function ConsentBanner() {
  const { t } = useTranslation();
  const [choice, setChoice] = useState<ConsentChoice | null>(null);
  const [ready, setReady] = useState(false);

  // Read on mount rather than during render: on the server there is no
  // localStorage, and a mismatch would flash the banner for everyone.
  useEffect(() => {
    setChoice(readConsent());
    setReady(true);
  }, []);

  function decide(next: ConsentChoice) {
    recordConsent(next);
    setChoice(next);
  }

  if (!ready || choice !== null) return null;

  return (
    <div
      role="region"
      aria-label={t("consent.title")}
      className="fixed bottom-0 inset-x-0 z-[90] p-4"
    >
      <div className="max-w-3xl mx-auto glass-panel border border-border rounded-xl p-5 shadow-2xl">
        <h2 className="text-sm font-bold mb-2">{t("consent.title")}</h2>
        <p className="text-[13px] leading-6 text-muted-foreground mb-4">
          {t("consent.body")}{" "}
          <Link to="/legal/$doc" params={{ doc: "cookies" }} className="underline">
            {t("consent.cookiePolicy")}
          </Link>
          .
        </p>
        {/* Equal weight, equal effort. */}
        <div className="flex flex-col sm:flex-row gap-2">
          <button
            type="button"
            onClick={() => decide("accepted")}
            className="flex-1 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-bold active:scale-[0.97] hover:opacity-90"
          >
            {t("consent.accept")}
          </button>
          <button
            type="button"
            onClick={() => decide("essential-only")}
            className="flex-1 px-4 py-2.5 rounded-lg border border-border text-foreground text-sm font-bold active:scale-[0.97] hover:opacity-90"
          >
            {t("consent.essentialOnly")}
          </button>
        </div>
      </div>
    </div>
  );
}
