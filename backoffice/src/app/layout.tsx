import type { Metadata } from "next";
import { IBM_Plex_Mono, Public_Sans, Space_Grotesk } from "next/font/google";
import { ThemeBootstrap } from "@/components/theme-bootstrap";
import "./globals.css";

const publicSans = Public_Sans({
  subsets: ["latin"],
  variable: "--font-public-sans",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-ibm-plex-mono",
});

export const metadata: Metadata = {
  title: "Pocket Genes Admin",
  description:
    "Pocket Genes Admin moderation console for accounts, community, reports, and learning operations.",
};

// Pre-paint theme script (issue #168). The base `:root` tokens are DARK and
// the light palette only applies under `html[data-theme="light"]`, so the
// document MUST carry the right data-theme before first paint. Previously the
// attribute was hardcoded to "light" in the SSR HTML and corrected in a
// post-hydration useEffect (ThemeBootstrap) — every full document load (new
// tab, reload, login redirect) painted ~0.5s of light mode for dark-mode
// users. This script runs synchronously in <head>, before any paint, reading
// the same localStorage keys ThemeBootstrap uses ("gc-fitness-appearance"
// first, then the Pocket Genes key). The attribute is no longer rendered by
// React, so RSC refreshes can't stomp the runtime value back to light.
const themeInitScript = `(function(){var t="light";try{var s=localStorage.getItem("gc-fitness-appearance")||localStorage.getItem("pocket-genes-admin-appearance");if(s==="dark"||s==="light")t=s;}catch(e){}var d=document.documentElement;d.dataset.theme=t;d.style.colorScheme=t;d.classList.toggle("dark",t==="dark");})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${publicSans.variable} ${spaceGrotesk.variable} ${ibmPlexMono.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="font-sans antialiased">
        <ThemeBootstrap />
        {children}
      </body>
    </html>
  );
}
