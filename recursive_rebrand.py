#!/usr/bin/env python3
from __future__ import annotations

import argparse
import re
import shutil
import sys
from pathlib import Path


SOURCE_EXTENSIONS = {
    ".c", ".cc", ".cpp", ".cxx", ".h", ".hh", ".hpp", ".hxx",
    ".cs", ".css", ".go", ".graphql", ".gql", ".groovy", ".html",
    ".htm", ".java", ".js", ".jsx", ".json", ".kt", ".kts", ".less",
    ".lua", ".m", ".mm", ".php", ".pl", ".pm", ".properties", ".py",
    ".r", ".rb", ".rs", ".sass", ".scala", ".scss", ".sh", ".sql",
    ".svelte", ".swift", ".toml", ".ts", ".tsx", ".vue", ".xml",
    ".yaml", ".yml", ".zsh",
}

SOURCE_FILENAMES = {
    "dockerfile", "makefile", "rakefile", "gemfile", "cmakelists.txt",
}

DEFAULT_EXCLUDED_DIRS = {
    ".git", ".hg", ".svn", ".idea", ".vscode", "node_modules", "vendor",
    "dist", "build", "coverage", "target", "__pycache__", ".venv", "venv",
}

REPLACEMENTS = (
    (re.compile(r"La\s+Jolla\s+Labs", re.IGNORECASE), "bajabio"),
    (re.compile(r"\bLJL\b", re.IGNORECASE), "bajabio"),
    (re.compile(r"\bPTX\b", re.IGNORECASE), "bajabio"),
)

FILENAME_REPLACEMENT = re.compile(r"bajabio|bajabio", re.IGNORECASE)
FOLDERNAME_REPLACEMENT = re.compile(r"bajabio|bajabio|bajabio", re.IGNORECASE)

# A baja/bajabio token used as a directory component in a relative or absolute path.
# Examples: baja/images/a.js, /srv/baja/config, ..\baja\images.
PATH_COMPONENT_REPLACEMENT = re.compile(
    r"(?<![A-Za-z0-9_.-])(?:bajabio|bajabio|bajabio)(?=[/\\])", re.IGNORECASE
)


def is_source_file(path: Path) -> bool:
    return path.suffix.lower() in SOURCE_EXTENSIONS or path.name.lower() in SOURCE_FILENAMES


def comment_header_span(text: str) -> tuple[int, int] | None:
    """Return a leading comment/header span only when it contains 'copyright'."""
    offset = 0

    # Preserve a Unix shebang and Python encoding declaration.
    first_end = text.find("\n") + 1
    if text.startswith("#!") and first_end:
        offset = first_end
    encoding = re.match(r"^[ \t]*#.*coding[:=][ \t]*[-\w.]+[^\n]*(?:\n|$)", text[offset:])
    if encoding:
        offset += encoding.end()

    rest = text[offset:]
    patterns = (
        # C/C++, JavaScript, CSS, Java, etc.
        re.compile(r"^[ \t]*/\*.*?\*/[ \t]*(?:\r?\n)?", re.DOTALL),
        # HTML/XML.
        re.compile(r"^[ \t]*<!--.*?-->[ \t]*(?:\r?\n)?", re.DOTALL),
        # Python/shell/Ruby-style consecutive comment lines.
        re.compile(r"^(?:(?:[ \t]*#[^\n]*)(?:\r?\n|$))+"),
        # JavaScript/C++-style consecutive line comments.
        re.compile(r"^(?:(?:[ \t]*//[^\n]*)(?:\r?\n|$))+"),
        # A leading Python module string used as a legal header.
        re.compile(r"^[ \t]*(?:[rubfRUBF]{0,2})(?:\"\"\".*?\"\"\"|'''.*?''')[ \t]*(?:\r?\n)?", re.DOTALL),
    )

    # Allow blank lines between the shebang/encoding and the header.
    blank = re.match(r"^(?:[ \t]*\r?\n)*", rest)
    prefix = blank.end() if blank else 0
    for pattern in patterns:
        match = pattern.match(rest[prefix:])
        if match and re.search(r"\bcopyright\b|©", match.group(0), re.IGNORECASE):
            end = offset + prefix + match.end()
            # Remove blank lines left immediately after the deleted header.
            trailing = re.match(r"(?:[ \t]*\r?\n)*", text[end:])
            return offset, end + (trailing.end() if trailing else 0)
    return None


def transform(text: str) -> tuple[str, bool, bool]:
    header_removed = False
    span = comment_header_span(text)
    if span:
        text = text[: span[0]] + text[span[1] :]
        header_removed = True

    original = text
    # Folder references must use the same lowercase name as renamed folders.
    # Do this before general company-name replacement so baja/images does not
    # become baja/images.
    text = PATH_COMPONENT_REPLACEMENT.sub("baja", text)
    for pattern, replacement in REPLACEMENTS:
        text = pattern.sub(replacement, text)
    return text, text != original, header_removed


def rebranded_filename(name: str) -> str:
    """Replace baja/bajabio substrings in a filename with lowercase 'baja'."""
    return FILENAME_REPLACEMENT.sub("baja", name)


def rebranded_foldername(name: str) -> str:
    """Normalize baja/baja/previous bajabio text in folder names to 'baja'."""
    return FOLDERNAME_REPLACEMENT.sub("baja", name)


def is_excluded(relative: Path, excluded: set[str], include_last: bool = False) -> bool:
    parts = relative.parts if include_last else relative.parts[:-1]
    return any(part in excluded for part in parts)


def decode_source(data: bytes) -> tuple[str, str] | None:
    if b"\x00" in data:
        return None
    for encoding in ("utf-8", "utf-8-sig"):
        try:
            return data.decode(encoding), encoding
        except UnicodeDecodeError:
            pass
    return None


def main() -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Replace bajabio/baja/bajabio content with bajabio, rename baja/bajabio "
            "source filenames and folders using 'baja', update source-code path "
            "references, and remove leading copyright headers."
        )
    )
    parser.add_argument("root", type=Path, help="Directory to scan recursively")
    parser.add_argument("--write", action="store_true", help="Modify files (default: dry run)")
    parser.add_argument("--backup", action="store_true", help="Create FILE.bak before modifying")
    parser.add_argument("--max-mb", type=float, default=10, help="Skip files larger than this (default: 10)")
    parser.add_argument("--exclude", action="append", default=[], metavar="DIR", help="Additional directory name to skip")
    args = parser.parse_args()

    root = args.root.resolve()
    if not root.is_dir():
        parser.error(f"not a directory: {root}")

    excluded = DEFAULT_EXCLUDED_DIRS | set(args.exclude)
    max_bytes = int(args.max_mb * 1024 * 1024)
    scanned = changed = renamed_files = renamed_folders = skipped = 0

    # Snapshot paths first so renaming a file cannot disturb recursive iteration.
    for path in list(root.rglob("*")):
        if path.is_symlink() or not path.is_file():
            continue
        try:
            relative = path.relative_to(root)
        except ValueError:
            continue
        if is_excluded(relative, excluded) or not is_source_file(path):
            continue

        scanned += 1
        try:
            if path.stat().st_size > max_bytes:
                skipped += 1
                print(f"SKIP large: {relative}")
                continue
            data = path.read_bytes()
            decoded = decode_source(data)
            if decoded is None:
                skipped += 1
                print(f"SKIP binary/non-UTF-8: {relative}")
                continue
            text, encoding = decoded
            updated, content_rebranded, header_removed = transform(text)
            new_name = rebranded_filename(path.name)
            name_changed = new_name != path.name

            if updated != text:
                changed += 1
                actions = []
                if content_rebranded:
                    actions.append("content rebranded")
                if header_removed:
                    actions.append("copyright header removed")
                print(f"{'WRITE' if args.write else 'WOULD CHANGE'}: {relative} ({', '.join(actions)})")

            if args.write and updated != text:
                if args.backup:
                    shutil.copy2(path, path.with_name(path.name + ".bak"))
                path.write_bytes(updated.encode(encoding))

            if name_changed:
                destination = path.with_name(new_name)
                destination_relative = destination.relative_to(root)
                if destination.exists():
                    skipped += 1
                    print(f"SKIP rename; destination exists: {relative} -> {destination_relative}")
                else:
                    renamed_files += 1
                    print(f"{'RENAME' if args.write else 'WOULD RENAME'}: {relative} -> {destination_relative}")
                    if args.write:
                        path.rename(destination)
        except (OSError, UnicodeError) as exc:
            skipped += 1
            print(f"ERROR {relative}: {exc}", file=sys.stderr)

    # Rename directories deepest-first. This keeps child paths valid while each
    # parent is renamed and also supports nested names such as baja/baja/.
    directories = [path for path in root.rglob("*") if path.is_dir() and not path.is_symlink()]
    directories.sort(key=lambda path: len(path.relative_to(root).parts), reverse=True)

    for directory in directories:
        try:
            relative = directory.relative_to(root)
        except ValueError:
            continue
        if is_excluded(relative, excluded, include_last=True):
            continue

        new_name = rebranded_foldername(directory.name)
        if new_name == directory.name:
            continue

        destination = directory.with_name(new_name)
        destination_relative = destination.relative_to(root)
        if destination.exists():
            skipped += 1
            print(f"SKIP folder rename; destination exists: {relative} -> {destination_relative}")
            continue

        renamed_folders += 1
        print(f"{'RENAME FOLDER' if args.write else 'WOULD RENAME FOLDER'}: {relative} -> {destination_relative}")
        try:
            if args.write:
                directory.rename(destination)
        except OSError as exc:
            skipped += 1
            print(f"ERROR {relative}: {exc}", file=sys.stderr)

    mode = "write" if args.write else "dry-run"
    print(
        f"\nDone ({mode}): scanned={scanned}, content_changed={changed}, "
        f"files_renamed={renamed_files}, folders_renamed={renamed_folders}, skipped={skipped}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
