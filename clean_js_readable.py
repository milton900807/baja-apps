#!/usr/bin/env python3

import sys
import argparse
from pathlib import Path


def strip_js_comments_keep_format(js: str) -> str:
    """
    Remove JS comments while keeping code readable.
    Preserves:
      - single quoted strings
      - double quoted strings
      - template literals
      - regex literals (heuristic)
    Removes:
      - // line comments
      - /* block comments */
    """

    out = []
    i = 0
    n = len(js)

    in_single = False
    in_double = False
    in_template = False
    in_line_comment = False
    in_block_comment = False
    in_regex = False
    regex_char_class = False
    escaped = False

    while i < n:
        ch = js[i]
        nxt = js[i + 1] if i + 1 < n else ""

        if in_line_comment:
            if ch == "\n":
                in_line_comment = False
                out.append("\n")
            i += 1
            continue

        if in_block_comment:
            if ch == "*" and nxt == "/":
                in_block_comment = False
                i += 2
                continue
            if ch == "\n":
                out.append("\n")
            i += 1
            continue

        if in_single:
            out.append(ch)
            if escaped:
                escaped = False
            elif ch == "\\":
                escaped = True
            elif ch == "'":
                in_single = False
            i += 1
            continue

        if in_double:
            out.append(ch)
            if escaped:
                escaped = False
            elif ch == "\\":
                escaped = True
            elif ch == '"':
                in_double = False
            i += 1
            continue

        if in_template:
            out.append(ch)
            if escaped:
                escaped = False
            elif ch == "\\":
                escaped = True
            elif ch == "`":
                in_template = False
            i += 1
            continue

        if in_regex:
            out.append(ch)
            if escaped:
                escaped = False
            elif ch == "\\":
                escaped = True
            elif regex_char_class:
                if ch == "]":
                    regex_char_class = False
            elif ch == "[":
                regex_char_class = True
            elif ch == "/":
                in_regex = False
            i += 1
            continue

        if ch == "/" and nxt == "/":
            in_line_comment = True
            i += 2
            continue

        if ch == "/" and nxt == "*":
            in_block_comment = True
            i += 2
            continue

        if ch == "'":
            in_single = True
            out.append(ch)
            i += 1
            continue

        if ch == '"':
            in_double = True
            out.append(ch)
            i += 1
            continue

        if ch == "`":
            in_template = True
            out.append(ch)
            i += 1
            continue

        # Heuristic regex detection
        if ch == "/":
            j = i - 1
            while j >= 0 and js[j].isspace():
                j -= 1
            prev_sig = js[j] if j >= 0 else ""
            if prev_sig in ("", "(", "=", ":", ",", "!", "&", "|", "?", "{", "}", ";", "["):
                in_regex = True
                regex_char_class = False
                escaped = False
                out.append(ch)
                i += 1
                continue

        out.append(ch)
        i += 1

    return "".join(out)


def clean_whitespace_readable(js: str) -> str:
    """
    Keep code readable:
      - remove trailing spaces
      - collapse multiple blank lines
      - normalize spacing-only lines
    """
    lines = js.splitlines()
    cleaned = []

    blank_count = 0
    for line in lines:
        line = line.rstrip()

        if line.strip() == "":
            blank_count += 1
            if blank_count <= 1:
                cleaned.append("")
        else:
            blank_count = 0
            cleaned.append(line)

    # remove leading blank lines
    while cleaned and cleaned[0] == "":
        cleaned.pop(0)

    # remove trailing blank lines
    while cleaned and cleaned[-1] == "":
        cleaned.pop()

    return "\n".join(cleaned) + "\n"


def remove_obvious_debugger_lines(js: str) -> str:
    """
    Remove lines that are only 'debugger;'
    """
    lines = js.splitlines()
    out = []
    for line in lines:
        if line.strip() == "debugger;" or line.strip() == "debugger":
            continue
        out.append(line)
    return "\n".join(out)


def clean_js_file_content(js: str) -> str:
    js = strip_js_comments_keep_format(js)
    js = remove_obvious_debugger_lines(js)
    js = clean_whitespace_readable(js)
    return js


def should_process(path: Path) -> bool:
    return path.suffix.lower() == ".js" and not path.name.endswith(".min.js")


def process_file(input_path: Path, output_path: Path) -> None:
    source = input_path.read_text(encoding="utf-8", errors="replace")
    cleaned = clean_js_file_content(source)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(cleaned, encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Recursively remove JS comments and obvious unnecessary lines while preserving readable formatting."
    )
    parser.add_argument("input_dir", help="Source directory")
    parser.add_argument("output_dir", help="Destination directory")
    parser.add_argument("--in-place", action="store_true", help="Overwrite files in place")
    args = parser.parse_args()

    input_dir = Path(args.input_dir).resolve()
    output_dir = Path(args.output_dir).resolve()

    if not input_dir.exists() or not input_dir.is_dir():
        print(f"Input directory does not exist or is not a directory: {input_dir}", file=sys.stderr)
        sys.exit(1)

    processed = 0
    failed = 0

    for file_path in input_dir.rglob("*.js"):
        if not should_process(file_path):
            continue

        try:
            out_path = file_path if args.in_place else output_dir / file_path.relative_to(input_dir)
            process_file(file_path, out_path)
            processed += 1
            print(f"OK: {file_path} -> {out_path}")
        except Exception as e:
            failed += 1
            print(f"FAILED: {file_path} :: {e}", file=sys.stderr)

    print()
    print(f"Processed: {processed}")
    print(f"Failed:    {failed}")


if __name__ == "__main__":
    main()
