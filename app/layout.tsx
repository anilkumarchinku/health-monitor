import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { ReminderSound } from "@/components/reminder-sound";
import { ToastProvider } from "@/components/ui/toast";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Health Monitor",
  description: "Your meals, medicines, water and sleep, one check-in at a time.",
  manifest: "/manifest.json",
  icons: {
    icon: "/icon.svg",
    apple: "/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    title: "Health Monitor",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#386748",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body className={inter.className}>
        <ToastProvider>
          <ReminderSound />
          {children}
        </ToastProvider>
      </body>
    </html>
  );
}
