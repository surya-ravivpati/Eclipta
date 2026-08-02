import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/legal/notices")({
  component: NoticesPage,
});

/**
 * Third-party notices.
 *
 * This page exists because of a distinction that is easy to lose: making
 * **Eclipta** proprietary is entirely a business decision, but the MIT, Apache-2.0
 * and BSD licences on the ~60 packages Eclipta is built from *require* their
 * copyright and permission notices to be preserved in distributions. Removing
 * "Eclipta is open source" from our marketing is correct; removing these notices
 * would be a licence breach.
 *
 * The list below is the load-bearing set. It should be regenerated from the
 * lockfile as part of the release process rather than maintained by hand.
 */

interface Dep {
  name: string;
  licence: string;
  holder: string;
}

const DEPENDENCIES: Dep[] = [
  { name: "React", licence: "MIT", holder: "Meta Platforms, Inc. and affiliates" },
  { name: "React DOM", licence: "MIT", holder: "Meta Platforms, Inc. and affiliates" },
  { name: "TanStack Router", licence: "MIT", holder: "Tanner Linsley" },
  { name: "TanStack Query", licence: "MIT", holder: "Tanner Linsley" },
  { name: "Vite", licence: "MIT", holder: "Evan You and Vite contributors" },
  { name: "TypeScript", licence: "Apache-2.0", holder: "Microsoft Corporation" },
  { name: "Tailwind CSS", licence: "MIT", holder: "Tailwind Labs, Inc." },
  { name: "Radix UI", licence: "MIT", holder: "WorkOS" },
  { name: "shadcn/ui", licence: "MIT", holder: "shadcn" },
  { name: "Framer Motion", licence: "MIT", holder: "Framer B.V." },
  { name: "Lucide", licence: "ISC", holder: "Lucide Contributors" },
  { name: "Drizzle ORM", licence: "Apache-2.0", holder: "Drizzle Team" },
  { name: "Supabase JS", licence: "MIT", holder: "Supabase, Inc." },
  { name: "Zod", licence: "MIT", holder: "Colin McDonnell" },
  { name: "date-fns", licence: "MIT", holder: "Sasha Koss and date-fns contributors" },
  { name: "KaTeX", licence: "MIT", holder: "Khan Academy and KaTeX contributors" },
  { name: "Recharts", licence: "MIT", holder: "Recharts Group" },
  { name: "Sonner", licence: "MIT", holder: "Emil Kowalski" },
  { name: "React Hook Form", licence: "MIT", holder: "Beier Luo" },
];

const MIT_TEXT = `Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.`;

function NoticesPage() {
  return (
    <div className="min-h-screen pt-24 pb-20 px-6">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-4xl font-display font-bold tracking-tight mb-2">Third-Party Notices</h1>
        <p className="text-muted-foreground mb-8">
          Eclipta is proprietary software. It is built using the open-source components below, whose
          licences require that their notices be preserved.
        </p>

        <div className="p-4 rounded-lg border border-border bg-secondary/20 mb-10">
          <p className="text-sm text-muted-foreground">
            Listing these components does not make Eclipta open source and grants no rights in
            Eclipta itself. See the{" "}
            <Link to="/legal/$doc" params={{ doc: "terms" }} className="underline">
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link to="/legal/$doc" params={{ doc: "copyright" }} className="underline">
              Copyright Policy
            </Link>
            .
          </p>
        </div>

        <h2 className="text-xl font-display font-bold mb-4">Components</h2>
        <div className="overflow-x-auto mb-12">
          <table className="w-full text-sm">
            <caption className="sr-only">
              Open-source components used by Eclipta, with their licences and copyright holders
            </caption>
            <thead>
              <tr className="border-b border-border text-left">
                <th scope="col" className="py-2 pr-4 font-bold">
                  Component
                </th>
                <th scope="col" className="py-2 pr-4 font-bold">
                  Licence
                </th>
                <th scope="col" className="py-2 font-bold">
                  Copyright
                </th>
              </tr>
            </thead>
            <tbody>
              {DEPENDENCIES.map((d) => (
                <tr key={d.name} className="border-b border-border/50">
                  <td className="py-2 pr-4 text-foreground">{d.name}</td>
                  <td className="py-2 pr-4 text-muted-foreground whitespace-nowrap">{d.licence}</td>
                  <td className="py-2 text-muted-foreground">© {d.holder}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h2 className="text-xl font-display font-bold mb-3">MIT Licence</h2>
        <p className="text-sm text-muted-foreground mb-3">
          Applies to the MIT-licensed components above, each under its own copyright holder.
        </p>
        <pre className="p-4 rounded-lg border border-border bg-secondary/20 text-xs leading-6 text-muted-foreground whitespace-pre-wrap">
          {MIT_TEXT}
        </pre>

        <p className="mt-8 text-sm text-muted-foreground">
          Apache-2.0 and ISC licensed components are governed by their respective licence texts,
          available from each project. Full licence texts for all components are distributed with
          the application build.
        </p>
      </div>
    </div>
  );
}
