import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LogiTrack MY — Logistics Operations",
  description: "Malaysia logistics management platform",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-white min-h-screen">
        {children}
      </body>
    </html>
  );
}
