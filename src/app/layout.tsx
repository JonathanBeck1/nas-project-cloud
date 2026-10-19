import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export const metadata: Metadata = {
  title: "NAS Project Cloud",
  description: "Project-first local file cloud for TrueNAS"
};

const themeBootstrapScript = `
(function () {
  try {
    var stored = window.localStorage.getItem("nas-cloud:theme");
    var prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    var resolved = stored === "light" || stored === "dark" ? stored : prefersDark ? "dark" : "light";
    if (resolved === "dark") {
      document.documentElement.classList.add("dark");
    }
  } catch (error) {
    // ignore - fall back to default light theme
  }
})();
`.trim();

export default async function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Set by middleware; the page CSP refuses inline scripts without it.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
