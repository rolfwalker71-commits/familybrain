import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AppShell } from "@/components/layout/app-shell";
import { THEME_FOUC_SCRIPT } from "@/lib/theme/fouc-script";
import { BRAND, BRAND_TAGLINE } from "@/lib/branding";
import "./globals.css";

/** Brand typography: Geist (intentional; not Inter). */
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: BRAND.app,
    template: `%s · ${BRAND.app}`,
  },
  description: BRAND_TAGLINE,
  applicationName: BRAND.app,
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: BRAND.app,
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: "/icon-192.png?v=bmono", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png?v=bmono", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      {
        url: "/apple-touch-icon.png?v=bmono",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f7f6" },
    { media: "(prefers-color-scheme: dark)", color: "#1c212b" },
  ],
  colorScheme: "light dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="de"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{ __html: THEME_FOUC_SCRIPT }}
        />
      </head>
      <body className="min-h-full font-sans">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
