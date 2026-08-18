import { describe, expect, it, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { I18nProvider } from "./index";
import { useTranslation } from "./use-translation";
import { readStoredLocale } from "./core";

/**
 * Two records of the same choice - the profile and localStorage - can disagree,
 * and the wrong precedence is invisible: the user just sees a language they did
 * not pick, with nothing on screen to explain it. So the order is pinned here.
 */

function Probe() {
  const { locale, t } = useTranslation();
  return (
    <>
      <span data-testid="probe">{locale}</span>
      <span data-testid="copy">{t("language.select")}</span>
      <span data-testid="missing">{t("nothing.here")}</span>
    </>
  );
}

const locale = () => screen.getByTestId("probe").textContent;

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.lang = "";
  document.documentElement.dir = "";
});

describe("I18nProvider", () => {
  it("uses the locally stored choice when no profile answer has arrived", async () => {
    window.localStorage.setItem("eclipta:locale", "fr");
    render(
      <I18nProvider>
        <Probe />
      </I18nProvider>,
    );
    await waitFor(() => expect(locale()).toBe("fr"));
  });

  it("adopts the profile language once it arrives", async () => {
    const { rerender } = render(
      <I18nProvider userPreference={null}>
        <Probe />
      </I18nProvider>,
    );
    rerender(
      <I18nProvider userPreference="ja">
        <Probe />
      </I18nProvider>,
    );
    await waitFor(() => expect(locale()).toBe("ja"));
  });

  it("lets the profile override a stale local choice, and updates that copy", async () => {
    // The user picked French here months ago and German on their phone
    // yesterday. The profile knows about both devices; localStorage does not.
    window.localStorage.setItem("eclipta:locale", "fr");
    const { rerender } = render(
      <I18nProvider userPreference={null}>
        <Probe />
      </I18nProvider>,
    );
    await waitFor(() => expect(locale()).toBe("fr"));
    rerender(
      <I18nProvider userPreference="de">
        <Probe />
      </I18nProvider>,
    );
    await waitFor(() => expect(locale()).toBe("de"));
    expect(readStoredLocale()).toBe("de");
  });

  it("ignores a profile language the app no longer ships", async () => {
    window.localStorage.setItem("eclipta:locale", "fr");
    render(
      <I18nProvider userPreference="xx-YY">
        <Probe />
      </I18nProvider>,
    );
    await waitFor(() => expect(locale()).toBe("fr"));
    expect(readStoredLocale()).toBe("fr");
  });

  it("sets lang and dir on the document, so assistive tech reads it right", async () => {
    render(
      <I18nProvider userPreference="ko">
        <Probe />
      </I18nProvider>,
    );
    await waitFor(() => expect(document.documentElement.lang).toBe("ko"));
    expect(document.documentElement.dir).toBe("ltr");
  });

  it("serves the chosen language's copy, not English", async () => {
    render(
      <I18nProvider userPreference="es">
        <Probe />
      </I18nProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("copy")).toHaveTextContent("Seleccionar idioma"));
  });

  it("shows the key for a message that does not exist", async () => {
    // Visible in review and searchable in a bug report. A blank is neither.
    render(
      <I18nProvider userPreference="en">
        <Probe />
      </I18nProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("missing")).toHaveTextContent("nothing.here"));
  });
});
