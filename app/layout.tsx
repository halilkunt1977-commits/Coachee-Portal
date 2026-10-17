import type { Metadata, Viewport } from "next";
import { RegisterSW } from "@/components/app/RegisterSW";
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

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="de" className={`${geist.variable} ${bricolage.variable} h-full antialiased`}>
      <body className="min-h-full">
        {children}
        <RegisterSW />
      </body>
    </html>
  );
}
