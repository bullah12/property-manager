"use client";

import { Menu } from "lucide-react";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { titleForPath } from "@/lib/nav";
import { SidebarNav } from "./sidebar-nav";
import { UserMenu } from "./user-menu";

export function Topbar() {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <header className="flex h-14 items-center gap-3 border-b bg-background px-4 md:px-6">
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetTrigger asChild className="md:hidden">
          <Button variant="ghost" size="icon" aria-label="Open navigation">
            <Menu className="size-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-64 p-0">
          <SheetHeader className="border-b px-4 py-3">
            <SheetTitle>Property Manager</SheetTitle>
          </SheetHeader>
          <div className="py-3">
            <SidebarNav onNavigate={() => setDrawerOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>
      <h1 className="flex-1 truncate text-base font-semibold">{titleForPath(pathname)}</h1>
      <UserMenu />
    </header>
  );
}
