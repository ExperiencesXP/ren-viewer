"""Extract labels, characters, images, screens, galleries from Ren'Py script text."""

from __future__ import annotations

import re
from dataclasses import dataclass, field


_LABEL = re.compile(r"^[ \t]*label[ \t]+([A-Za-z0-9_\.]+)\s*:", re.M)
_JUMP = re.compile(r"^[ \t]*jump[ \t]+([A-Za-z0-9_\.]+)", re.M)
_CALL = re.compile(r"^[ \t]*call[ \t]+([A-Za-z0-9_\.]+)", re.M)
_SCREEN = re.compile(r"^[ \t]*screen[ \t]+([A-Za-z0-9_]+)", re.M)
_TRANSFORM = re.compile(r"^[ \t]*transform[ \t]+([A-Za-z0-9_]+)", re.M)
_IMAGE = re.compile(r"^[ \t]*image[ \t]+([A-Za-z0-9_]+(?:[ \t]+[A-Za-z0-9_]+)*)[ \t]*=", re.M)
_LAYERED = re.compile(r"^[ \t]*layeredimage[ \t]+([A-Za-z0-9_]+(?:[ \t]+[A-Za-z0-9_]+)*)\s*:", re.M)
_DEFINE_CHAR = re.compile(
    r"""^[ \t]*define[ \t]+([A-Za-z_][A-Za-z0-9_]*)[ \t]*=[ \t]*(Dynamic)?Character\((.*)$""",
    re.M,
)
_CHAR_STRING = re.compile(r"""['\"]([^'\"]+)['\"]""")
_CHAR_IMAGE = re.compile(r"""image\s*=\s*['\"]([^'\"]+)['\"]""")
_MENU_CHOICE = re.compile(
    r"""^[ \t]*['\"](.+?)['\"][ \t]*:\s*(?:#.*)?$""",
    re.M,
)
_JUMP_IN_BLOCK = re.compile(r"[ \t]*jump[ \t]+([A-Za-z0-9_\.]+)")
_PLAY = re.compile(r"^[ \t]*play[ \t]+(music|sound|voice)[ \t]+(.+)$", re.M)
_SHOW = re.compile(r"^[ \t]*(show|scene)[ \t]+([A-Za-z0-9_]+(?:[ \t]+[A-Za-z0-9_]+)*)", re.M)
_GALLERY_BTN = re.compile(r"\.button\s*\(|Gallery\s*\(", re.M)
_CONFIG_NAME = re.compile(r"""config\.name\s*=\s*[_]*\(\s*['\"](.+?)['\"]|config\.name\s*=\s*['\"](.+?)['\"]""")
_CONFIG_VERSION = re.compile(r"""config\.version\s*=\s*['\"](.+?)['\"]""")
_SAVE_DIR = re.compile(r"""config\.save_directory\s*=\s*['\"](.+?)['\"]""")


@dataclass
class CharacterDef:
    store_name: str
    display_name: str
    image_tag: str | None = None
    kind: str = "Character"
    file: str | None = None


@dataclass
class ImageDef:
    name: str
    file: str | None = None
    kind: str = "image"  # image | layeredimage | auto
    source_file: str | None = None


@dataclass
class LabelDef:
    name: str
    file: str
    jumps: list[str] = field(default_factory=list)
    calls: list[str] = field(default_factory=list)
    menus: list[MenuChoice] = field(default_factory=list)
    shows: list[str] = field(default_factory=list)
    plays: list[tuple[str, str]] = field(default_factory=list)


@dataclass
class MenuChoice:
    text: str
    target: str | None = None


@dataclass
class ScriptIndex:
    labels: dict[str, LabelDef] = field(default_factory=dict)
    characters: list[CharacterDef] = field(default_factory=list)
    images: list[ImageDef] = field(default_factory=list)
    screens: list[str] = field(default_factory=list)
    transforms: list[str] = field(default_factory=list)
    gallery_mentioned: bool = False
    musicroom_mentioned: bool = False
    config_name: str | None = None
    config_version: str | None = None
    save_directory: str | None = None
    files: list[str] = field(default_factory=list)

    def merge(self, other: "ScriptIndex") -> None:
        self.labels.update(other.labels)
        self.characters.extend(other.characters)
        self.images.extend(other.images)
        self.screens.extend(other.screens)
        self.transforms.extend(other.transforms)
        self.gallery_mentioned = self.gallery_mentioned or other.gallery_mentioned
        self.musicroom_mentioned = self.musicroom_mentioned or other.musicroom_mentioned
        self.config_name = self.config_name or other.config_name
        self.config_version = self.config_version or other.config_version
        self.save_directory = self.save_directory or other.save_directory
        self.files.extend(other.files)


def index_text(text: str, filename: str) -> ScriptIndex:
    idx = ScriptIndex(files=[filename])
    idx.screens = _SCREEN.findall(text)
    idx.transforms = _TRANSFORM.findall(text)
    idx.gallery_mentioned = bool(_GALLERY_BTN.search(text) or "Gallery(" in text)
    idx.musicroom_mentioned = "MusicRoom(" in text

    m = _CONFIG_NAME.search(text)
    if m:
        idx.config_name = m.group(1) or m.group(2)
    m = _CONFIG_VERSION.search(text)
    if m:
        idx.config_version = m.group(1)
    m = _SAVE_DIR.search(text)
    if m:
        idx.save_directory = m.group(1)

    for store, dynamic, rest in _DEFINE_CHAR.findall(text):
        image_m = _CHAR_IMAGE.search(rest)
        image_tag = image_m.group(1) if image_m else None
        pos = _CHAR_STRING.match(rest.lstrip())
        if pos and not pos.group(1).endswith("_name"):
            display = pos.group(1)
        elif image_tag:
            display = image_tag.replace("_", " ").title()
        else:
            display = store
        idx.characters.append(
            CharacterDef(
                store_name=store,
                display_name=display,
                image_tag=image_tag,
                kind="DynamicCharacter" if dynamic else "Character",
                file=filename,
            )
        )

    for name in _IMAGE.findall(text):
        idx.images.append(ImageDef(name=" ".join(name.split()), kind="image", source_file=filename))
    for name in _LAYERED.findall(text):
        idx.images.append(ImageDef(name=" ".join(name.split()), kind="layeredimage", source_file=filename))

    labels = [(m.start(), m.group(1)) for m in _LABEL.finditer(text)]
    labels.append((len(text), None))
    for i in range(len(labels) - 1):
        start, name = labels[i]
        end, _ = labels[i + 1]
        if not name:
            continue
        body = text[start:end]
        jumps = _JUMP.findall(body)
        calls = _CALL.findall(body)
        menus: list[MenuChoice] = []
        for cm in _MENU_CHOICE.finditer(body):
            choice_text = cm.group(1)
            window = body[cm.end() : cm.end() + 200]
            jm = _JUMP_IN_BLOCK.search(window)
            menus.append(MenuChoice(text=choice_text, target=jm.group(1) if jm else None))
        shows = [" ".join(g[1].split()) for g in _SHOW.findall(body)]
        plays = []
        for channel, rest in _PLAY.findall(body):
            plays.append((channel, rest.strip()))
        idx.labels[name] = LabelDef(
            name=name,
            file=filename,
            jumps=jumps,
            calls=calls,
            menus=menus,
            shows=shows,
            plays=plays,
        )
    return idx


def auto_images_from_paths(paths: list[str]) -> list[ImageDef]:
    """Ren'Py auto-defines images from filenames under the game tree."""
    out: list[ImageDef] = []
    image_ext = {".png", ".jpg", ".jpeg", ".webp", ".avif", ".gif"}
    for p in paths:
        lower = p.lower()
        if not any(lower.endswith(ext) for ext in image_ext):
            continue
        if p.startswith("common/") or p.startswith("basedir/") or p.startswith("gui/"):
            continue
        stem = p.rsplit(".", 1)[0]
        parts = stem.replace("\\", "/").split("/")
        name = parts[-1].replace("_", " ")
        out.append(ImageDef(name=name, file=p, kind="auto"))
    return out
