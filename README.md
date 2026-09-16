# Ren-Viewer

Local Ren'Py resource studio. Open a game folder, browse the unified virtual filesystem (archives + loose files, engine load order), decompile scripts, walk the story graph, inspect characters and CGs, and export a patch overlay.

## Run

Python deps are managed with [Poetry](https://python-poetry.org/). The `decompile` extra pulls [unrpyc](https://github.com/CensoredUsername/unrpyc) so compiled `.rpyc` scripts become readable `.rpy`. Without it you can still browse archives and media.

```bash
poetry install --extras decompile
cd web && npm install && npm run build
poetry run ren-viewer "path\to\renpy\game"
```

Dev (API + Vite):

```bash
poetry install --extras decompile
poetry run uvicorn ren_viewer.app:app --reload --port 8741
cd web && npm install && npm run dev
```

Open http://127.0.0.1:5173 and paste a game folder (the directory that contains `game/`).


Do not redistribute extracted game assets. Original files stay read-only unless you explicitly write a backup and replace them.

## License

MIT. Games you open remain the property of their authors.
