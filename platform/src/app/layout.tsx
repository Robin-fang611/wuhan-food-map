import type { Metadata } from "next";
import "./globals.css";
import { AppProvider } from "./providers";

export const metadata: Metadata = {
  title: "江城 · 全校日常平台",
  description: "中南财经政法大学 · 民间非官方 · 学业 + 生活一站式平台",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="min-h-screen bg-neutral-50 text-neutral-900 antialiased dark:bg-neutral-950 dark:text-neutral-100">
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var t=localStorage.getItem('jc_theme');if(t==='dark')document.documentElement.classList.add('dark');}catch(e){}",
          }}
        />
        <AppProvider>{children}</AppProvider>
      </body>
    </html>
  );
}
