import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "EKT AI — консультант по электротехнике",
  description: "Поиск электротехнической продукции EKT по реальному каталогу",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}

