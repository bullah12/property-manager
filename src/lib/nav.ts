import {
  Bell,
  Building2,
  LayoutDashboard,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  title: string;
  href: string;
  icon: LucideIcon;
  /** Set on the Notifications item; the sidebar renders the unread badge. */
  showUnreadBadge?: boolean;
}

/** Config-driven sidebar per the dashboard-ui-patterns skill (PLAN.md §4). */
export const navItems: NavItem[] = [
  { title: "Overview", href: "/", icon: LayoutDashboard },
  { title: "Properties", href: "/properties", icon: Building2 },
  { title: "Tenants", href: "/tenants", icon: Users },
  { title: "Notifications", href: "/notifications", icon: Bell, showUnreadBadge: true },
  { title: "Settings", href: "/settings", icon: Settings },
];

export function titleForPath(pathname: string): string {
  const match = [...navItems]
    .sort((a, b) => b.href.length - a.href.length)
    .find((i) => (i.href === "/" ? pathname === "/" : pathname.startsWith(i.href)));
  return match?.title ?? "Property Manager";
}
