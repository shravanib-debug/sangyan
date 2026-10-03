"use client";

import type { ReactNode } from "react";

import { I18nProvider } from "@/i18n/provider";
import { PwaBootstrap } from "@/features/pwa/pwa-bootstrap";

export function Providers({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <I18nProvider>
      <PwaBootstrap />
      {children}
    </I18nProvider>
  );
}
