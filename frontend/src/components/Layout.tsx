import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  AlertTriangle,
  Boxes,
  Brain,
  ClipboardCheck,
  Database,
  FileText,
  GanttChart,
  History,
  LayoutDashboard,
  Moon,
  Play,
  ScanSearch,
  Sun,
  UploadCloud,
  User,
  Workflow,
  Menu,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { isOfflineActive, onOfflineChange } from "../api/offline";

const NAV: { section: string; items: { to: string; label: string; icon: typeof LayoutDashboard }[] }[] = [
  { section: "Overview", items: [{ to: "/", label: "Overview", icon: LayoutDashboard }] },
  {
    section: "Data",
    items: [
      { to: "/ingestion", label: "Data Ingestion", icon: UploadCloud },
      { to: "/reports", label: "Field Reports", icon: FileText },
      { to: "/extraction", label: "Event Extraction", icon: ScanSearch },
    ],
  },
  {
    section: "Verify",
    items: [
      { to: "/review", label: "Review Queue", icon: ClipboardCheck },
      { to: "/evidence", label: "Evidence Center", icon: Database },
      { to: "/conflicts", label: "Conflicts", icon: AlertTriangle },
    ],
  },
  {
    section: "Execution",
    items: [
      { to: "/twin", label: "Execution Twin", icon: Boxes },
      { to: "/schedule", label: "Schedule / Gantt", icon: GanttChart },
      { to: "/impact", label: "Dependency Impact", icon: Workflow },
    ],
  },
  {
    section: "Intelligence",
    items: [
      { to: "/what-if", label: "What-If Simulator", icon: Brain },
      { to: "/memory", label: "Institutional Memory", icon: Database },
    ],
  },
  { section: "Governance", items: [{ to: "/audit", label: "Audit Trail", icon: History }] },
];

const TITLES: Record<string, string> = {
  "/": "Command Center",
  "/ingestion": "Data Ingestion",
  "/reports": "Field Reports",
  "/extraction": "Event Verification",
  "/review": "Review Queue",
  "/evidence": "Evidence & Conflict Center",
  "/conflicts": "Conflicts",
  "/twin": "Execution Twin",
  "/schedule": "Schedule / Gantt",
  "/impact": "Dependency Impact",
  "/what-if": "What-If Simulator",
  "/memory": "Institutional Memory",
  "/audit": "Audit Trail",
};

export function Layout({ onRunDemo }: { onRunDemo: () => void }) {
  const [dark, setDark] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [offline, setOffline] = useState(isOfflineActive());
  const location = useLocation();

  useEffect(() => onOfflineChange(setOffline), []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  // Close the mobile drawer whenever the route changes
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const title = TITLES[location.pathname] || "Command Center";

  return (
    <div className="flex h-screen overflow-hidden bg-canvas">
      {/* Dimmed backdrop behind the drawer on mobile */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar: drawer overlay on mobile, permanent column on md+ */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[80%] max-w-[300px] shrink-0 flex-col bg-navy text-slate-300 transition-transform duration-300 md:static md:z-auto md:w-60 md:max-w-none md:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="px-4 h-14 flex items-center gap-2.5 border-b border-white/10">
          <div className="w-7 h-7 rounded bg-blue-600 flex items-center justify-center">
            <Workflow className="w-4 h-4 text-white" />
          </div>
          <div className="leading-tight flex-1">
            <div className="text-[13px] font-bold text-white tracking-wide">EXECUTION</div>
            <div className="text-[13px] font-bold text-white tracking-wide -mt-0.5">TRUTH ENGINE</div>
          </div>
          <button
            onClick={() => setMobileOpen(false)}
            className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-white/10 transition-colors md:hidden"
            aria-label="Close navigation"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto py-3 px-2">
          {NAV.map((group) => (
            <div key={group.section} className="mb-4">
              <div className="px-2 mb-1 text-[9px] font-bold uppercase tracking-[0.18em] text-slate-500">
                {group.section}
              </div>
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === "/"}
                  onClick={() => setMobileOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-2.5 px-2 py-1.5 rounded text-[12.5px] font-medium mb-0.5 transition-colors ${
                      isActive
                        ? "bg-white/10 text-white"
                        : "text-slate-400 hover:text-white hover:bg-white/5"
                    }`
                  }
                >
                  <item.icon className="w-4 h-4 shrink-0" />
                  {item.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="px-3 py-3 border-t border-white/10 space-y-2">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-400 live-dot" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-amber-400">Demo Data</span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full live-dot ${offline ? "bg-amber-400" : "bg-emerald-400"}`}
            />
            <span className={`text-[11px] ${offline ? "text-amber-400 font-semibold" : "text-slate-400"}`}>
              {offline ? "Bundled demo data" : "System Operational"}
            </span>
          </div>
          <div className="flex items-center gap-2 pt-1">
            <User className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-[11px] text-slate-400">Planner</span>
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 shrink-0 bg-surface border-b border-border flex items-center justify-between px-3 sm:px-5 gap-2">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <button
              onClick={() => setMobileOpen(true)}
              className="p-2 rounded border border-border text-muted hover:text-ink hover:bg-surface2 transition-colors md:hidden shrink-0"
              aria-label="Open navigation"
            >
              <Menu className="w-4 h-4" />
            </button>
            <h1 className="text-[14px] sm:text-[15px] font-bold text-ink truncate">{title}</h1>
            <span className="hidden sm:inline text-[10px] font-semibold text-muted border border-border rounded px-1.5 py-0.5 shrink-0">
              OIL-ASSAM-001
            </span>
            {offline && (
              <span className="text-[9px] font-bold uppercase tracking-widest text-amber-600 dark:text-amber-400 border border-amber-400 rounded px-1.5 py-0.5 shrink-0">
                Offline demo
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={onRunDemo}
              className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded text-[12px] font-semibold bg-navy text-white hover:bg-slate-800 transition-colors"
            >
              <Play className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Run Hero Demo</span>
              <span className="sm:hidden">Demo</span>
            </button>
            <button
              onClick={() => setDark((d) => !d)}
              className="p-2 rounded border border-border text-muted hover:text-ink hover:bg-surface2 transition-colors"
              aria-label="Toggle theme"
            >
              {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
