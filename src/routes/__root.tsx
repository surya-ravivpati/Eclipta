import { Outlet, Link, createRootRoute, HeadContent, Scripts, useRouterState } from "@tanstack/react-router";
import { Luna } from "@/components/Luna";
import { Navbar } from "@/components/Navbar";
import { SiteFooter } from "@/components/SiteFooter";
import { AuthProvider } from "@/hooks/use-auth";
import { ThemeProvider } from "@/hooks/use-theme";
import { Toaster } from "@/components/ui/sonner";
import appCss from "../styles.css?url";

const HIDE_LUNA_ON   = ["/login", "/signup", "/forgot-password", "/reset-password", "/luna", "/"];
const HIDE_FOOTER_ON = ["/login", "/signup", "/forgot-password", "/reset-password", "/luna"];
const HIDE_NAVBAR_ON = ["/login", "/signup", "/forgot-password", "/reset-password", "/onboarding"];

// The landing page (/) manages its own footer, so exclude it
const isLanding = (p: string) => p === "/";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">
          Page not found
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Eclipta – A Smarter Way to Learn" },
      { name: "description", content: "Adaptive learning arena with AI guidance, knowledge battles, and personalized courses." },
      { name: "author", content: "Eclipta" },
      { property: "og:title", content: "Eclipta – A Smarter Way to Learn" },
      { property: "og:description", content: "Adaptive learning arena with AI guidance, knowledge battles, and personalized courses." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:site", content: "@Lovable" },
      { name: "twitter:title", content: "Eclipta – A Smarter Way to Learn" },
      { name: "twitter:description", content: "Adaptive learning arena with AI guidance, knowledge battles, and personalized courses." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/90e3f2a3-56ad-49c1-9436-64fe4dea81b2/id-preview-2a5f5b94--94fe3209-1fa2-4291-84cb-22e764a6769a.lovable.app-1778039701316.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/90e3f2a3-56ad-49c1-9436-64fe4dea81b2/id-preview-2a5f5b94--94fe3209-1fa2-4291-84cb-22e764a6769a.lovable.app-1778039701316.png" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", type: "image/png", href: "/favicon.png" },
      { rel: "apple-touch-icon", href: "/favicon.png" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@300;400;500;600;700&family=Bebas+Neue&family=JetBrains+Mono:wght@400;500&family=Instrument+Serif:ital@0;1&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const showLuna   = !HIDE_LUNA_ON.some((p) => pathname.startsWith(p));
  const showFooter = !isLanding(pathname) && !HIDE_FOOTER_ON.some((p) => pathname.startsWith(p));
  const showNavbar = !HIDE_NAVBAR_ON.some((p) => pathname.startsWith(p));
  return (
    <ThemeProvider>
      <AuthProvider>
        {showNavbar && <Navbar />}
        <Outlet />
        {showFooter && <SiteFooter />}
        {showLuna && <Luna />}
        <Toaster />
      </AuthProvider>
    </ThemeProvider>
  );
}
