import React from "react";
import {
  Archive,
  Boxes,
  Clock3,
  FolderKanban,
  HardDrive,
  Image,
  Inbox,
  Layers3,
  MonitorUp,
  PackageOpen,
  Ruler,
  Settings,
  Tags,
  Video
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { SMART_VIEWS } from "@/lib/shared/defaults";
import type { SmartViewKey } from "@/lib/shared/types";

type NavItem = {
  label: string;
  icon: LucideIcon;
  isActive?: boolean;
};

const libraryItems: NavItem[] = [
  { label: "Inbox", icon: Inbox, isActive: true },
  { label: "Projects", icon: FolderKanban },
  { label: "Categories", icon: Tags }
];

const systemItems: NavItem[] = [
  { label: "Devices", icon: HardDrive },
  { label: "Archive", icon: Archive },
  { label: "Settings", icon: Settings }
];

const smartViewIcons: Partial<Record<SmartViewKey, LucideIcon>> = {
  recent: Clock3,
  unsorted: PackageOpen,
  "large-files": Boxes,
  cad: Ruler,
  media: Layers3,
  images: Image,
  videos: Video,
  "from-windows": MonitorUp
};

const smartViewItems = SMART_VIEWS.filter((view) => view.key !== "inbox")
  .slice(0, 6)
  .map<NavItem>((view) => ({
    label: view.name,
    icon: smartViewIcons[view.key] ?? Layers3
  }));

function NavigationGroup({ title, items }: { title: string; items: NavItem[] }) {
  return (
    <section className="space-y-2" aria-labelledby={`${title.toLowerCase().replace(/\s+/g, "-")}-nav-heading`}>
      <h2
        id={`${title.toLowerCase().replace(/\s+/g, "-")}-nav-heading`}
        className="px-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted"
      >
        {title}
      </h2>
      <ul className="space-y-1">
        {items.map((item) => {
          const Icon = item.icon;

          return (
            <li key={item.label}>
              <a
                href="#"
                aria-current={item.isActive ? "page" : undefined}
                className={`flex h-9 items-center gap-3 rounded-md px-2.5 text-sm font-medium transition ${
                  item.isActive
                    ? "bg-accent text-white shadow-panel"
                    : "text-ink hover:bg-line/60 hover:text-ink"
                }`}
              >
                <Icon aria-hidden="true" className="h-4 w-4 shrink-0" strokeWidth={2} />
                <span className="truncate">{item.label}</span>
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function Sidebar() {
  return (
    <aside className="flex h-full w-full flex-col border-r border-line bg-panel/95">
      <div className="border-b border-line px-4 py-4">
        <p className="text-sm font-semibold text-ink">NAS Project Cloud</p>
        <p className="mt-1 truncate text-xs text-muted">Local Vault</p>
      </div>
      <nav
        aria-label="Workspace"
        className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-3 py-4"
      >
        <NavigationGroup title="Library" items={libraryItems} />
        <NavigationGroup title="Smart Views" items={smartViewItems} />
        <NavigationGroup title="System" items={systemItems} />
      </nav>
      <div className="border-t border-line px-3 py-3">
        <LogoutButton />
      </div>
    </aside>
  );
}
