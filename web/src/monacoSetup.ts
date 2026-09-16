import { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";

self.MonacoEnvironment = {
  getWorker() {
    return new editorWorker();
  },
};

loader.config({ monaco });

monaco.editor.defineTheme("folio", {
  base: "vs-dark",
  inherit: true,
  rules: [
    { token: "", foreground: "e8dcc8" },
    { token: "comment", foreground: "8a7e70", fontStyle: "italic" },
    { token: "string", foreground: "c4a574" },
    { token: "keyword", foreground: "c23a3a" },
    { token: "number", foreground: "b08d57" },
    { token: "identifier", foreground: "e8dcc8" },
  ],
  colors: {
    "editor.background": "#141210",
    "editor.foreground": "#e8dcc8",
    "editor.lineHighlightBackground": "#1c1814",
    "editorLineNumber.foreground": "#8a7e70",
    "editorLineNumber.activeForeground": "#e8dcc8",
    "editorCursor.foreground": "#c23a3a",
    "editor.selectionBackground": "#b08d5744",
    "editor.inactiveSelectionBackground": "#b08d5722",
    "editorIndentGuide.background": "#2a241e",
    "editorIndentGuide.activeBackground": "#b08d5755",
    "editorWidget.background": "#1c1814",
    "editorWidget.border": "#b08d5755",
    "editorGutter.background": "#141210",
    "scrollbarSlider.background": "#b08d5733",
    "scrollbarSlider.hoverBackground": "#b08d5755",
  },
});
