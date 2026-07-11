"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Bot,
  Box,
  ChevronDown,
  ClipboardList,
  Factory,
  FolderKanban,
  Home,
  Image,
  Search,
  Settings,
  ShoppingBag,
  SlidersHorizontal,
  Store,
  Users,
  Wrench,
} from "lucide-react";

type NavigationChild = {
  label: string;
  href?: string;
  comingSoon?: boolean;
};

type NavigationGroup = {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  routePrefixes: string[];
  children: NavigationChild[];
};

const navigationGroups: NavigationGroup[] = [
  {
    label: "Catalog",
    icon: Box,
    routePrefixes: ["/products", "/suppliers", "/pricing", "/collections"],
    children: [
      { label: "Products", href: "/products" },
      { label: "Collections", comingSoon: true },
      { label: "Suppliers", comingSoon: true },
      { label: "Pricing", comingSoon: true },
    ],
  },
  {
    label: "Team Stores",
    icon: Store,
    routePrefixes: ["/team-stores", "/teams", "/coaches"],
    children: [
      { label: "Stores", comingSoon: true },
      { label: "Teams", comingSoon: true },
      { label: "Coaches", comingSoon: true },
    ],
  },
  {
    label: "Artwork",
    icon: Image,
    routePrefixes: ["/artwork", "/mockups", "/templates", "/logos"],
    children: [
      { label: "Artwork Library", comingSoon: true },
      { label: "Mockups", comingSoon: true },
      { label: "Templates", comingSoon: true },
      { label: "Logos", comingSoon: true },
    ],
  },
  {
    label: "Production",
    icon: Factory,
    routePrefixes: ["/production", "/jobs", "/schedule", "/quality-control"],
    children: [
      { label: "Jobs", comingSoon: true },
      { label: "Schedule", comingSoon: true },
      { label: "Quality Control", comingSoon: true },
    ],
  },
  {
    label: "Operations",
    icon: Wrench,
    routePrefixes: [
      "/operations",
      "/sops",
      "/machines",
      "/maintenance",
      "/inventory",
      "/purchasing",
      "/documents",
    ],
    children: [
      { label: "SOP Library", comingSoon: true },
      { label: "Machines", comingSoon: true },
      { label: "Maintenance", comingSoon: true },
      { label: "Inventory", comingSoon: true },
      { label: "Purchasing", comingSoon: true },
      { label: "Documents", comingSoon: true },
    ],
  },
  {
    label: "Customers",
    icon: Users,
    routePrefixes: ["/customers", "/organizations", "/contacts", "/assets"],
    children: [
      { label: "Organizations", comingSoon: true },
      { label: "Contacts", comingSoon: true },
      { label: "Assets", comingSoon: true },
    ],
  },
  {
    label: "Quotes",
    icon: ClipboardList,
    routePrefixes: ["/quotes", "/quote-requests", "/active-quotes"],
    children: [
      { label: "Quote Requests", comingSoon: true },
      { label: "Active Quotes", comingSoon: true },
      { label: "Templates", comingSoon: true },
    ],
  },
  {
    label: "Projects",
    icon: FolderKanban,
    routePrefixes: ["/projects"],
    children: [
      { label: "Ideas", comingSoon: true },
      { label: "Active Projects", comingSoon: true },
      { label: "Testing", comingSoon: true },
      { label: "Completed", comingSoon: true },
    ],
  },
  {
    label: "Insights",
    icon: BarChart3,
    routePrefixes: ["/insights", "/dashboards", "/reports"],
    children: [
      { label: "Dashboards", comingSoon: true },
      { label: "Reports", comingSoon: true },
      { label: "Continuous Improvement", comingSoon: true },
    ],
  },
  {
    label: "AI",
    icon: Bot,
    routePrefixes: ["/ai", "/workflows", "/automations"],
    children: [
      { label: "Crossbar Assistant", comingSoon: true },
      { label: "Workflows", comingSoon: true },
      { label: "Automations", comingSoon: true },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    Catalog: true,
  });

  useEffect(() => {
    const matchingGroup = navigationGroups.find((group) =>
      group.routePrefixes.some(
        (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
      )
    );

    if (!matchingGroup) return;

    setOpenGroups((current) => ({
      ...current,
      [matchingGroup.label]: true,
    }));
  }, [pathname]);

  function toggleGroup(label: string) {
    setOpenGroups((current) => ({
      ...current,
      [label]: !current[label],
    }));
  }

  return (
    <aside className="flex min-h-screen w-72 flex-shrink-0 flex-col border-r border-slate-300 bg-slate-700 text-white">
      <div className="border-b border-slate-600 px-6 py-6">
        <h1 className="text-xl font-bold tracking-wide">Crossbar OS</h1>
        <p className="mt-1 text-sm text-slate-300">
          Company Operating System
        </p>

        <div className="mt-3 inline-flex rounded-full bg-slate-600 px-2.5 py-1 text-xs font-medium text-slate-200">
          v0.2 Alpha
        </div>
      </div>

      <div className="px-4 py-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

          <input
            type="text"
            placeholder="Search Crossbar OS..."
            disabled
            className="w-full rounded-lg border border-slate-600 bg-slate-800 py-2.5 pl-10 pr-3 text-sm text-white placeholder:text-slate-400 disabled:cursor-not-allowed"
          />
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-4 pb-6">
        <Link
          href="/dashboard"
          className={`mb-2 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
            pathname === "/dashboard"
              ? "bg-[#860132] text-white"
              : "text-slate-200 hover:bg-slate-600 hover:text-white"
          }`}
        >
          <Home className="h-4 w-4" />
          Dashboard
        </Link>

        <div className="my-4 border-t border-slate-600" />

        <div className="space-y-1">
          {navigationGroups.map((group) => {
            const Icon = group.icon;
            const isOpen = Boolean(openGroups[group.label]);

            return (
              <div key={group.label}>
                <button
                  type="button"
                  onClick={() => toggleGroup(group.label)}
                  className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm font-medium text-slate-200 transition hover:bg-slate-600 hover:text-white"
                >
                  <span className="flex items-center gap-3">
                    <Icon className="h-4 w-4" />
                    {group.label}
                  </span>

                  <ChevronDown
                    className={`h-4 w-4 transition-transform ${
                      isOpen ? "rotate-180" : ""
                    }`}
                  />
                </button>

                {isOpen && (
                  <div className="ml-7 mt-1 space-y-1 border-l border-slate-500 pl-3">
                    {group.children.map((child) => {
                      const isActive =
                        child.href &&
                        (pathname === child.href ||
                          pathname.startsWith(`${child.href}/`));

                      if (child.href) {
                        return (
                          <Link
                            key={child.label}
                            href={child.href}
                            className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm transition ${
                              isActive
                                ? "bg-[#860132] font-medium text-white"
                                : "text-slate-300 hover:bg-slate-600 hover:text-white"
                            }`}
                          >
                            {child.label}
                          </Link>
                        );
                      }

                      return (
                        <button
                          key={child.label}
                          type="button"
                          disabled
                          className="flex w-full cursor-not-allowed items-center justify-between rounded-lg px-3 py-2 text-left text-sm text-slate-400"
                        >
                          <span>{child.label}</span>

                          {child.comingSoon && (
                            <span className="rounded bg-slate-600 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-300">
                              Soon
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </nav>

      <div className="border-t border-slate-600 p-4">
        <button
          type="button"
          disabled
          className="flex w-full cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-slate-300"
        >
          <Settings className="h-4 w-4" />
          Settings
        </button>

        <div className="mt-3 rounded-xl border border-slate-600 bg-slate-800/60 p-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Current Workspace
          </div>

          <div className="mt-2 flex items-center gap-2">
            <ShoppingBag className="h-4 w-4 text-white" />
            <p className="text-sm font-medium text-white">Catalog Manager</p>
          </div>
        </div>
      </div>
    </aside>
  );
}