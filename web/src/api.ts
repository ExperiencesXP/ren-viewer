export class SessionClosedError extends Error {
  readonly status = 409;
  constructor(message = "no game open") {
    super(message);
    this.name = "SessionClosedError";
  }
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export type Health = {
  ok: boolean;
  version: string;
  open: boolean;
};

export type ArchiveInfo = {
  name: string;
  path?: string;
  version: string;
  key: string | null;
  file_count: number;
  size: number;
};

export type GameCounts = {
  files: number;
  images: number;
  audio: number;
  video: number;
  scripts: number;
  fonts: number;
  other: number;
};

export type GameInfo = {
  name: string;
  opened_path: string;
  basedir: string;
  gamedir: string;
  engine_family: string;
  engine_vc: string | number | null;
  python_major: number | null;
  launcher: string | null;
  languages: string[];
  archives: ArchiveInfo[];
  counts: GameCounts;
  overlay: string;
  is_lone_archive: boolean;
};

export type FileSource = {
  layer: string;
  path: string;
  archive: string | null;
  archive_path: string | null;
  offset: number | null;
  length: number;
  disk_path: string | null;
};

export type VfsNode = {
  path: string;
  name: string;
  is_dir: boolean;
  size: number;
  kind: string;
  sniffed?: string | null;
  source: FileSource | null;
};

export type TreeResponse = {
  path: string;
  nodes: VfsNode[];
};

export type StatResponse = {
  path: string;
  size: number;
  kind: string;
  sniffed: string | null;
  mime: string;
  source: FileSource;
};

export type ScriptContent = {
  path: string;
  text: string;
  error: string | null | undefined;
};

export type MenuChoice = {
  text: string;
  target: string | null;
};

export type LabelInfo = {
  name: string;
  file: string;
  jumps: string[];
  calls: string[];
  menus: MenuChoice[];
};

export type CharacterDef = {
  store_name: string;
  display_name: string;
  image_tag: string | null;
  kind: string;
  file: string | null;
};

export type ImageDef = {
  name: string;
  file: string | null;
  kind: string;
  source_file: string | null;
};

export type ScriptIndex = {
  name: string | null;
  version: string | null;
  save_directory: string | null;
  labels: LabelInfo[];
  characters: CharacterDef[];
  images: ImageDef[];
  screens: string[];
  gallery_mentioned: boolean;
  musicroom_mentioned: boolean;
  errors: Record<string, string>;
};

export type GraphNode = {
  id: string;
  kind: string;
  file: string | null;
  label: string | null;
};

export type GraphEdge = {
  source: string;
  target: string;
  kind: string;
  text: string | null;
};

export type StoryGraph = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  entries: string[];
};

export type GalleryItem = {
  name: string;
  file: string | null;
  origin: string;
};

export type GalleryResponse = {
  gallery_mentioned: boolean;
  items: GalleryItem[];
};

export type AudioItem = {
  path: string;
  size: number;
  source: string;
};

export type ChrExtra = {
  name: string;
  path: string;
  sniffed: string;
  mime: string;
  note: string;
  decoded_text: string | null;
};

export type SearchHit = {
  kind: string;
  path: string;
  preview: string;
  line?: number;
};

export type SearchResponse = {
  hits: SearchHit[];
};

const jsonHeaders = { "Content-Type": "application/json" };

async function readBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function detailOf(body: unknown, fallback: string): string {
  if (body && typeof body === "object" && "detail" in body) {
    const detail = (body as { detail: unknown }).detail;
    if (typeof detail === "string") return detail;
    try {
      return JSON.stringify(detail);
    } catch {
      return fallback;
    }
  }
  if (typeof body === "string" && body.trim()) return body;
  return fallback;
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, init);
  } catch {
    throw new ApiError(0, "Cannot reach the local studio API. Is the backend running on port 8741?");
  }
  if (res.status === 409) {
    throw new SessionClosedError(detailOf(await readBody(res), "no game open"));
  }
  if (!res.ok) {
    throw new ApiError(res.status, detailOf(await readBody(res), res.statusText || `HTTP ${res.status}`));
  }
  return (await readBody(res)) as T;
}

export const api = {
  health: () => request<Health>("/api/health"),
  open: (path: string) =>
    request<GameInfo>("/api/open", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ path }),
    }),
  close: () => request<{ ok: boolean }>("/api/close", { method: "POST" }),
  game: () => request<GameInfo>("/api/game"),
  tree: (path = "") => request<TreeResponse>(`/api/vfs/tree?path=${encodeURIComponent(path)}`),
  stat: (path: string) => request<StatResponse>(`/api/vfs/stat?path=${encodeURIComponent(path)}`),
  scripts: () => request<{ scripts: string[] }>("/api/scripts"),
  scriptContent: (path: string) =>
    request<ScriptContent>(`/api/scripts/content?path=${encodeURIComponent(path)}`),
  index: () => request<ScriptIndex>("/api/index"),
  graph: () => request<StoryGraph>("/api/graph"),
  gallery: () => request<GalleryResponse>("/api/gallery"),
  audio: () => request<{ items: AudioItem[] }>("/api/audio"),
  extrasChr: () => request<{ items: ChrExtra[] }>("/api/extras/chr"),
  search: (q: string) => request<SearchResponse>(`/api/search?q=${encodeURIComponent(q)}`),
  overlay: (path: string, text: string) =>
    request<{ ok: boolean; path: string }>("/api/overlay", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ path, text }),
    }),
  exportRpa: (dest: string, filename: string) =>
    request<{ ok: boolean; path: string }>("/api/export/rpa", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ dest, filename }),
    }),
  dialogFolder: () => request<{ path: string | null }>("/api/dialog/folder", { method: "POST" }),
};

export function vfsFileUrl(path: string): string {
  return `/api/vfs/file?path=${encodeURIComponent(path)}`;
}

const RECENT_KEY = "ren-viewer:recent";
const MAX_RECENT = 10;

export function loadRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export function pushRecent(path: string): void {
  const next = [path, ...loadRecent().filter((item) => item !== path)].slice(0, MAX_RECENT);
  localStorage.setItem(RECENT_KEY, JSON.stringify(next));
}

export function removeRecent(path: string): void {
  localStorage.setItem(RECENT_KEY, JSON.stringify(loadRecent().filter((item) => item !== path)));
}

export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

export function formatInt(n: number): string {
  return n.toLocaleString();
}

export function hexDump(bytes: Uint8Array, max = 1024): string {
  const slice = bytes.subarray(0, max);
  const lines: string[] = [];
  for (let i = 0; i < slice.length; i += 16) {
    const chunk = slice.subarray(i, i + 16);
    const hex = Array.from(chunk, (b) => b.toString(16).padStart(2, "0"));
    const hexCols = `${hex.slice(0, 8).join(" ")}  ${hex.slice(8).join(" ")}`.padEnd(48, " ");
    const ascii = Array.from(chunk, (b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : ".")).join("");
    lines.push(`${i.toString(16).padStart(8, "0")}  ${hexCols}  |${ascii}|`);
  }
  if (bytes.length > max) {
    lines.push(`… ${bytes.length - max} more bytes`);
  }
  return lines.join("\n");
}
