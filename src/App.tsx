import { Database, FileSpreadsheet, FileStack, LayoutGrid, ListChecks, Loader2, Menu, Printer, Tag } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, NavLink, Route, Routes, useMatch } from "react-router-dom";
import { isActiveJob, useDataset, useJobs } from "./api/hooks";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import { Empty } from "./components/ui/empty";
import { PageContainer } from "./components/ui/page-header";
import { Sidebar, SidebarItem, SidebarSection } from "./components/ui/sidebar";
import { Topbar } from "./components/ui/topbar";
import { cn } from "./lib/utils";
import { DataPage } from "./pages/DataPage";
import { EditorPage } from "./pages/EditorPage";
import { GeneratePage } from "./pages/GeneratePage";
import { JobsPage } from "./pages/JobsPage";
import { LibraryPage } from "./pages/LibraryPage";
import { PdfPage } from "./pages/PdfPage";
import { useSession } from "./stores/sessionStore";

const WORKFLOW = [
  { to: "/", label: "Templates", icon: LayoutGrid, end: true },
  { to: "/data", label: "Data", icon: Database },
  { to: "/generate", label: "Generate cards", icon: FileStack },
  { to: "/pdf", label: "Print PDF", icon: Printer },
];

const SIDEBAR_KEY = "printcraft:sidebar-condensed";

function useNarrowScreen() {
  const query = "(max-width: 1100px)";
  const [narrow, setNarrow] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const m = window.matchMedia(query);
    const h = () => setNarrow(m.matches);
    m.addEventListener("change", h);
    return () => m.removeEventListener("change", h);
  }, []);
  return narrow;
}

function useRunningJobs() {
  const { data } = useJobs();
  return data?.filter((j) => isActiveJob(j.status)).length ?? 0;
}

function DatasetChip() {
  const datasetId = useSession((s) => s.datasetId);
  const { data } = useDataset(datasetId);
  return (
    <NavLink
      to="/data"
      title={data ? data.filename : "Load a data file"}
      className={cn(
        "flex min-w-0 items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
        data ? "border-success/30 bg-success-soft text-success-text hover:border-success/60" : "border-dashed text-muted-foreground hover:border-primary/50 hover:text-primary",
      )}
    >
      <FileSpreadsheet className="size-4 shrink-0" />
      {data ? (
        <span className="truncate">
          {data.filename}
          {data.sheet ? ` · ${data.sheet}` : ""} <span className="font-normal opacity-80">· {data.row_count} rows</span>
        </span>
      ) : (
        <span>No data loaded</span>
      )}
    </NavLink>
  );
}

function Brand({ condensed }: { condensed: boolean }) {
  return (
    <Link to="/" className="flex items-center gap-2.5" aria-label="PrintCraft home">
      <span className="flex size-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-purple text-white shadow-lg shadow-primary/30">
        <Tag className="size-5" />
      </span>
      {!condensed && <span className="text-[1.05rem] font-extrabold tracking-tight text-white">PrintCraft</span>}
    </Link>
  );
}

export function App() {
  const isEditor = !!useMatch("/templates/:id");
  const narrow = useNarrowScreen();
  const running = useRunningJobs();
  const [preferCondensed, setPreferCondensed] = useState(() => localStorage.getItem(SIDEBAR_KEY) === "1");
  // The editor needs the width, so it starts condensed; the toggle can still expand it.
  const [expandedInEditor, setExpandedInEditor] = useState(false);
  useEffect(() => setExpandedInEditor(false), [isEditor]);
  const condensed = isEditor || narrow ? !expandedInEditor : preferCondensed;

  const toggle = () => {
    if (isEditor || narrow) setExpandedInEditor((v) => !v);
    else
      setPreferCondensed((v) => {
        localStorage.setItem(SIDEBAR_KEY, v ? "0" : "1");
        return !v;
      });
  };

  return (
    <div className="flex h-full">
      <Sidebar condensed={condensed} brand={<Brand condensed={condensed} />}>
        <SidebarSection title="Workflow" condensed={condensed} />
        {WORKFLOW.map(({ to, label, icon: Icon, end }) => (
          <SidebarItem key={to} to={to} end={end} label={label} icon={<Icon />} condensed={condensed} />
        ))}
        <SidebarSection title="Activity" condensed={condensed} />
        <SidebarItem
          to="/jobs"
          label="Jobs"
          icon={<ListChecks />}
          condensed={condensed}
          badge={
            running > 0 ? (
              <Badge variant="success" pill>
                {running}
              </Badge>
            ) : undefined
          }
        />
      </Sidebar>
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          start={
            <Button size="icon" className="size-9 rounded-full" onClick={toggle} aria-label={condensed ? "Expand menu" : "Collapse menu"}>
              <Menu />
            </Button>
          }
          end={
            <>
              {running > 0 && (
                <NavLink to="/jobs" className="flex items-center gap-1.5 rounded-full bg-primary-soft px-3 py-1.5 text-xs font-bold text-primary">
                  <Loader2 className="size-3.5 animate-spin" /> {running} job{running === 1 ? "" : "s"} running
                </NavLink>
              )}
              <DatasetChip />
            </>
          }
        />
        <main className={cn("min-h-0 flex-1", isEditor ? "overflow-hidden" : "overflow-y-auto")}>
          <Routes>
            <Route path="/" element={<LibraryPage />} />
            <Route path="/templates/:id" element={<EditorPage />} />
            <Route path="/data" element={<DataPage />} />
            <Route path="/generate" element={<GeneratePage />} />
            <Route path="/pdf" element={<PdfPage />} />
            <Route path="/jobs" element={<JobsPage />} />
            <Route path="/jobs/:id" element={<JobsPage />} />
            <Route
              path="*"
              element={
                <PageContainer>
                  <Empty icon={<LayoutGrid />} title="Page not found" action={<Button asChild><Link to="/">Back to templates</Link></Button>}>
                    The page you are looking for does not exist.
                  </Empty>
                </PageContainer>
              }
            />
          </Routes>
        </main>
      </div>
    </div>
  );
}
