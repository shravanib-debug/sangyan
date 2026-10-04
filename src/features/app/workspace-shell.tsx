"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { logout } from "../../../app/auth/actions";

type NavItem = {
  href: "/" | "/home" | "/checkin" | "/simulator" | "/journal" | "/import" | "/pact" | "/settings";
  label: string;
  icon: string;
  mobileLabel?: string;
};

const primaryNav: NavItem[] = [
  { href: "/home", label: "Dashboard", icon: "⌂", mobileLabel: "Home" },
  { href: "/checkin", label: "Decision Check-in", icon: "✓", mobileLabel: "Check-in" },
  { href: "/simulator", label: "Consequence Simulator", icon: "◒", mobileLabel: "Tools" },
  { href: "/journal", label: "Decision Journal", icon: "▤", mobileLabel: "Journal" },
  { href: "/import", label: "Import History", icon: "⇧" }
];

const mobileNav: NavItem[] = [
  { href: "/home", label: "Dashboard", icon: "⌂", mobileLabel: "Home" },
  { href: "/checkin", label: "Decision Check-in", icon: "✓", mobileLabel: "Check-in" },
  { href: "/simulator", label: "Consequence Simulator", icon: "◒", mobileLabel: "Tools" },
  { href: "/journal", label: "Decision Journal", icon: "▤", mobileLabel: "Journal" },
  { href: "/pact", label: "My Pact", icon: "♢", mobileLabel: "Pact" }
];

function NavLink({ item, compact = false }: Readonly<{ item: NavItem; compact?: boolean }>) {
  const pathname = usePathname();
  const active = pathname === item.href || (item.href !== "/home" && pathname.startsWith(`${item.href}/`));
  return (
    <Link className={`workspace-nav-link${active ? " is-active" : ""}${compact ? " is-compact" : ""}`} href={item.href}>
      <span className="workspace-nav-icon" aria-hidden="true">{item.icon}</span>
      <span>{compact ? item.mobileLabel ?? item.label : item.label}</span>
    </Link>
  );
}

export function WorkspaceShell({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="workspace">
      <aside className="workspace-sidebar" aria-label="Primary navigation">
        <Link className="workspace-brand" href="/home" aria-label="Thehrav dashboard">
          <span className="brand-mark">T</span>
          <span>THEHRAV</span>
        </Link>
        <nav className="workspace-nav">
          <p className="workspace-nav-label">Workspace</p>
          {primaryNav.map((item) => <NavLink key={item.href} item={item} />)}
        </nav>
        <div className="workspace-sidebar-bottom">
          <NavLink item={{ href: "/settings", label: "Settings", icon: "⚙" }} />
          <div className="workspace-profile">
            <span className="avatar">A</span>
            <span className="workspace-profile-copy"><strong>Aditya</strong><small>Free plan</small></span>
            <form action={logout} className="workspace-logout-form">
              <button type="submit" className="workspace-logout" aria-label="Log out">↪</button>
            </form>
          </div>
        </div>
      </aside>

      <div className="workspace-main">
        <header className="workspace-topbar">
          <div className="workspace-mobile-brand"><span className="brand-mark">T</span> THEHRAV</div>
          <div className="workspace-search" role="search">
            <span aria-hidden="true">⌕</span>
            <input aria-label="Search" placeholder="Search anything..." />
          </div>
          <div className="workspace-topbar-actions">
            <button className="icon-button" aria-label="Notifications">♧</button>
            <span className="avatar">A</span>
          </div>
        </header>
        <main className="workspace-content">{children}</main>
      </div>

      <nav className="workspace-mobile-nav" aria-label="Mobile navigation">
        {mobileNav.map((item) => <NavLink key={item.href} item={item} compact />)}
      </nav>
    </div>
  );
}
