import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cleaner Route Finder",
  description: "Read-only route analysis tool for finding the best-fit cleaner route for a new property.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-900 antialiased">{children}</body>
    </html>
  );
}
