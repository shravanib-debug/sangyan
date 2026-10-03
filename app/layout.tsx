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

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
