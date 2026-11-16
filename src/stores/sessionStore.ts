/** Cross-page session state (current dataset and preview record), persisted in localStorage. */
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SessionState {
  datasetId: string | null;
  recordIndex: number;
  setDataset(id: string | null): void;
  setRecordIndex(i: number): void;
}

// Carry over settings saved before the app was renamed from "Tag Creator".
for (const [from, to] of [
  ["tag-creator-session", "printcraft-session"],
  ["tag-creator:sidebar-condensed", "printcraft:sidebar-condensed"],
]) {
  try {
    const old = localStorage.getItem(from);
    if (old !== null) {
      if (localStorage.getItem(to) === null) localStorage.setItem(to, old);
      localStorage.removeItem(from);
    }
  } catch {
    // storage unavailable
  }
}

export const useSession = create<SessionState>()(
  persist(
    (set) => ({
      datasetId: null,
      recordIndex: 0,
      setDataset: (datasetId) => set({ datasetId, recordIndex: 0 }),
      setRecordIndex: (recordIndex) => set({ recordIndex: Math.max(0, recordIndex) }),
    }),
    { name: "printcraft-session" },
  ),
);
