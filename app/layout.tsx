import type { Metadata, Viewport } from "next";
import { RegisterSW } from "@/components/app/RegisterSW";
import { LangProvider } from "@/components/i18n/LangProvider";
import { serverLang } from "@/lib/i18n-server";
import { Bricolage_Grotesque, Geist } from "next/font/google";
import "./globals.css";

const geist = Geist({ variable: "--font-geist", subsets: ["latin"] });
const bricolage = Bricolage_Grotesque({ variable: "--font-bricolage", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Gründarium Portal", template: "%s · Gründarium Portal" },
  description: "Das Portal für Coachees von Gründarium.",
  robots: { index: false, follow: false },
  applicationName: "Gründarium",
  appleWebApp: { capable: true, title: "Gründarium", statusBarStyle: "black-translucent" },
  icons: { apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = { themeColor: "#0a1628", viewportFit: "cover" };

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Türkisch nur für Coachees, die der Coach darauf gestellt hat
  const lang = await serverLang();
  return (
    <html lang={lang} className={`${geist.variable} ${bricolage.variable} h-full antialiased`}>
      <body className="min-h-full">
        <LangProvider lang={lang}>{children}</LangProvider>
        <RegisterSW />
      </body>
    </html>
  );
}
