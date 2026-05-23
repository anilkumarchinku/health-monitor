import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { ReminderSound } from "@/components/reminder-sound";
import { ToastProvider } from "@/components/ui/toast";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Dee Meal Monitor System",
  description: "A friendly meal, water, sleep, and motivation tracker.",
  manifest: "/manifest.json",
  icons: {
    icon: "/icon.svg",
    apple: "/icon.svg",
  },
};

export const viewport: Viewport = {
  themeColor: "#15736d",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <ToastProvider>
          <ReminderSound />
          {children}
        </ToastProvider>
      </body>
    </html>
  );
}
