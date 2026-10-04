import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import "./globals.css";
import { Providers } from "@/features/app/providers";

export const metadata: Metadata = {
  title: {
    default: "Thehrav",
    template: "%s | Thehrav"
  },
  description: "A private pause between trading impulse and action.",
  applicationName: "Thehrav"
};

export const viewport: Viewport = {
  themeColor: "#175c45",
  colorScheme: "light"
};

// Runs before first paint: hides the page while a stored Hindi/Marathi locale is applied after hydration.
// The timeout is a fail-safe so the page can never stay hidden.
const LOCALE_GUARD = `(function(){try{var l=localStorage.getItem("thehrav.locale");if(l==="hi"||l==="mr"){var d=document.documentElement;d.setAttribute("data-locale-pending","");setTimeout(function(){d.removeAttribute("data-locale-pending")},3000)}}catch(e){}})();`;

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: LOCALE_GUARD }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
