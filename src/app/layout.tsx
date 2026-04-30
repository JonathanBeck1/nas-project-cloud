import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NAS Project Cloud",
  description: "Project-first local file cloud for TrueNAS"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
