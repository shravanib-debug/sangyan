import type { ReactNode } from "react";
import { WorkspaceShell } from "@/features/app/workspace-shell";

export default function PwaLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <WorkspaceShell>{children}</WorkspaceShell>;
}
