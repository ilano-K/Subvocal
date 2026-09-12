import { create } from "zustand";
import { mockLibrary, type Session } from "../data/mockData";

type LibState = {
  sessions: Session[];
  filter: string;
  sortBy: "recent" | "duration" | "chunks";
  setFilter: (v: string) => void;
  setSort: (v: LibState["sortBy"]) => void;
  remove: (id: string) => void;
  add: (s: Session) => void;
  upsert: (s: Session) => void;
};

export const useLibraryStore = create<LibState>((set) => ({
  sessions: mockLibrary,
  filter: "",
  sortBy: "recent",
  setFilter: (filter) => set({ filter }),
  setSort: (sortBy) => set({ sortBy }),
  remove: (id) => set((s) => ({ sessions: s.sessions.filter((x) => x.id !== id) })),
  add: (sess) => set((s) => ({ sessions: [sess, ...s.sessions] })),
  upsert: (sess) => set((s) => ({ sessions: [sess, ...s.sessions.filter((x) => x.id !== sess.id)] })),
}));
