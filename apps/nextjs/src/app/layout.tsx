import type { Metadata, Viewport } from "next";

export const dynamic = "force-dynamic";
import { Toaster } from "sonner";
import { Providers } from "./providers";
import "@/styles/globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#4f46e5",
};

export const metadata: Metadata = {
  title: {
    default: "AtelierOne",
    template: "%s | AtelierOne",
  },
  description: "Système de gestion pour librairies et papeteries",
  manifest: "/manifest.json",
  icons: {
    icon: "/favicon.ico",
    apple: "/icons/icon-192.svg",
  },
  appleWebApp: {
    capable: true,
    title: "AtelierOne",
    statusBarStyle: "black-translucent",
  },
};

const themeScript = `
(function() {
  try {
    var theme = localStorage.getItem('theme');
    var resolved = theme;
    if (theme === 'system' || !theme) {
      resolved = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    if (resolved && resolved !== 'light') {
      document.documentElement.classList.add(resolved);
    }
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600&family=Merriweather:wght@300;400;700&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <Providers>{children}</Providers>
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
