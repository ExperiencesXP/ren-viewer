import { createContext, useContext } from "react";
import type { GameInfo } from "./api";

export type PageId =
  | "overview"
  | "files"
  | "scripts"
  | "story"
  | "characters"
  | "gallery"
  | "audio";

export type PaletteMode = "search" | "files";

export type Studio = {
  game: GameInfo;
  page: PageId;
  setPage: (page: PageId) => void;
  selectedFile: string | null;
  setSelectedFile: (path: string | null) => void;
  selectedScript: string | null;
  setSelectedScript: (path: string | null) => void;
  highlightLabel: string | null;
  setHighlightLabel: (id: string | null) => void;
  refreshGame: () => Promise<void>;
  closeGame: () => Promise<void>;
  onClosed: () => void;
  openPalette: (mode: PaletteMode) => void;
};

export const PAGES: { id: PageId; label: string; numeral: string }[] = [
  { id: "overview", label: "Overview", numeral: "I" },
  { id: "files", label: "Files", numeral: "II" },
  { id: "scripts", label: "Scripts", numeral: "III" },
  { id: "story", label: "Story", numeral: "IV" },
  { id: "characters", label: "Characters", numeral: "V" },
  { id: "gallery", label: "Gallery", numeral: "VI" },
  { id: "audio", label: "Audio", numeral: "VII" },
];

export const StudioContext = createContext<Studio | null>(null);

export function useStudio(): Studio {
  const ctx = useContext(StudioContext);
  if (!ctx) throw new Error("StudioContext missing");
  return ctx;
}
