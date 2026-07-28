#!/usr/bin/env python3

import sys
import argparse
from pathlib import Path


def extract_leading_comment(text: str):
    text2 = text.lstrip()
    offset = len(text) - len(text2)

    if text2.startswith("/*"):
        end = text2.find("*/")
        if end != -1:
            comment = text2[:end + 2]
            rest = text2[end + 2:]
            return text[:offset] + comment, rest
    return "", text


def ___minify_js_simple(js: str) -> str:
    """
    Lightweight JS minifier:
    - removes // and /* */ comments
    - collapses whitespace
    - preserves strings/template literals/comments inside them
    Not as strong as terser/rjsmin, but dependency-free.
    """
    out = []
    i = 0
    n = len(js)

    in_single = False
    in_double = False
    in_template = False
    in_line_comment = False
    in_block_comment = False
    escaped = False
    prev_was_space = False

    while i < n:
        ch = js[i]
        nxt = js[i + 1] if i + 1 < n else ""

        if in_line_comment:
            if ch == "\n":
                in_line_comment = False
                if not prev_was_space:
                    out.append(" ")
                    prev_was_space = True
            i += 1
            continue

        if in_block_comment:
            if ch == "*" and nxt == "/":
                in_block_comment = False
                i += 2
            else:
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
            prev_was_space = False
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
            prev_was_space = False
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
            prev_was_space = False
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
            prev_was_space = False
            continue

        if ch == '"':
            in_double = True
            out.append(ch)
            i += 1
            prev_was_space = False
            continue

        if ch == "`":
            in_template = True
            out.append(ch)
            i += 1
            prev_was_space = False
            continue

        if ch.isspace():
            if not prev_was_space:
                out.append(" ")
                prev_was_space = True
            i += 1
            continue

        out.append(ch)
        prev_was_space = False
        i += 1

    s = "".join(out)

    # tighten common punctuation spacing
    for a, b in [
        (" = ", "="), (" == ", "=="), (" === ", "==="),
        (" != ", "!="), (" !== ", "!=="),
        (" + ", "+"), (" - ", "-"), (" * ", "*"), (" / ", "/"),
        (" % ", "%"), (" < ", "<"), (" > ", ">"),
        (" <= ", "<="), (" >= ", ">="),
        (" && ", "&&"), (" || ", "||"),
        (" ,", ","), (", ", ","), (" ;", ";"),
        ("; ", ";"), (" {", "{"), ("} ", "}"),
        ("( ", "("), (" )", ")"), ("[ ", "["), (" ]", "]"),
        (": ", ":"), (" :", ":"), (" ? ", "?"), (" ?","?"), ("? ", "?"),
    ]:
        s = s.replace(a, b)

    return s.strip()




def find_matching_brace(text: str, open_index: int):
    if open_index < 0 or open_index >= len(text) or text[open_index] != "{":
        raise ValueError("open_index must point to '{'")

    depth = 0
    i = open_index
    n = len(text)

    in_single = False
    in_double = False
    in_template = False
    in_line_comment = False
    in_block_comment = False
    in_regex = False
    regex_char_class = False
    escaped = False

    while i < n:
        ch = text[i]
        nxt = text[i + 1] if i + 1 < n else ""
        prev = text[i - 1] if i > 0 else ""

        if in_line_comment:
            if ch == "\n":
                in_line_comment = False
            i += 1
            continue

        if in_block_comment:
            if ch == "*" and nxt == "/":
                in_block_comment = False
                i += 2
                continue
            i += 1
            continue

        if in_single:
            if escaped:
                escaped = False
            elif ch == "\\":
                escaped = True
            elif ch == "'":
                in_single = False
            i += 1
            continue

        if in_double:
            if escaped:
                escaped = False
            elif ch == "\\":
                escaped = True
            elif ch == '"':
                in_double = False
            i += 1
            continue

        if in_template:
            if escaped:
                escaped = False
            elif ch == "\\":
                escaped = True
            elif ch == "`":
                in_template = False
            i += 1
            continue

        if in_regex:
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
            i += 1
            continue

        if ch == '"':
            in_double = True
            i += 1
            continue

        if ch == "`":
            in_template = True
            i += 1
            continue

        # Heuristic: detect start of regex literal
        if ch == "/":
            j = i - 1
            while j >= 0 and text[j].isspace():
                j -= 1
            prev_sig = text[j] if j >= 0 else ""

            if prev_sig in ("", "(", "=", ":", ",", "!", "&", "|", "?", "{", "}", ";", "["):
                in_regex = True
                regex_char_class = False
                escaped = False
                i += 1
                continue

        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return i

        i += 1

    raise ValueError("No matching closing brace found")




def minify_js_simple(js: str) -> str:
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
    prev_was_space = False

    while i < n:
        ch = js[i]
        nxt = js[i + 1] if i + 1 < n else ""

        if in_line_comment:
            if ch == "\n":
                in_line_comment = False
                if not prev_was_space:
                    out.append(" ")
                    prev_was_space = True
            i += 1
            continue

        if in_block_comment:
            if ch == "*" and nxt == "/":
                in_block_comment = False
                i += 2
            else:
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
            prev_was_space = False
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
            prev_was_space = False
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
            prev_was_space = False
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
            prev_was_space = False
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
            prev_was_space = False
            continue

        if ch == '"':
            in_double = True
            out.append(ch)
            i += 1
            prev_was_space = False
            continue

        if ch == "`":
            in_template = True
            out.append(ch)
            i += 1
            prev_was_space = False
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
                prev_was_space = False
                continue

        if ch.isspace():
            if not prev_was_space:
                out.append(" ")
                prev_was_space = True
            i += 1
            continue

        out.append(ch)
        prev_was_space = False
        i += 1

    s = "".join(out)

    for a, b in [
        (" = ", "="), (" == ", "=="), (" === ", "==="),
        (" != ", "!="), (" !== ", "!=="),
        (" + ", "+"), (" - ", "-"), (" * ", "*"),
        (" % ", "%"), (" < ", "<"), (" > ", ">"),
        (" <= ", "<="), (" >= ", ">="),
        (" && ", "&&"), (" || ", "||"),
        (" ,", ","), (", ", ","), (" ;", ";"),
        ("; ", ";"), (" {", "{"), ("} ", "}"),
        ("( ", "("), (" )", ")"), ("[ ", "["), (" ]", "]"),
        (": ", ":"), (" :", ":"),
    ]:
        s = s.replace(a, b)

    return s.strip()


def ____find_matching_brace(text: str, open_index: int):
    if open_index < 0 or open_index >= len(text) or text[open_index] != "{":
        raise ValueError("open_index must point to '{'")

    depth = 0
    i = open_index
    n = len(text)

    in_single = False
    in_double = False
    in_template = False
    in_line_comment = False
    in_block_comment = False
    escaped = False

    while i < n:
        ch = text[i]
        nxt = text[i + 1] if i + 1 < n else ""

        if in_line_comment:
            if ch == "\n":
                in_line_comment = False
            i += 1
            continue

        if in_block_comment:
            if ch == "*" and nxt == "/":
                in_block_comment = False
                i += 2
                continue
            i += 1
            continue

        if in_single:
            if escaped:
                escaped = False
            elif ch == "\\":
                escaped = True
            elif ch == "'":
                in_single = False
            i += 1
            continue

        if in_double:
            if escaped:
                escaped = False
            elif ch == "\\":
                escaped = True
            elif ch == '"':
                in_double = False
            i += 1
            continue

        if in_template:
            if escaped:
                escaped = False
            elif ch == "\\":
                escaped = True
            elif ch == "`":
                in_template = False
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
            i += 1
            continue

        if ch == '"':
            in_double = True
            i += 1
            continue

        if ch == "`":
            in_template = True
            i += 1
            continue

        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return i

        i += 1

    raise ValueError("No matching closing brace found")


def try_split_wrapped_function(text: str):
    """
    Supports:
      function (...) { ... }
      async function (...) { ... }

    Returns tuple or None if file is not wrapped that way.
    """
    leading_comment, rest = extract_leading_comment(text)
    stripped = rest.lstrip()
    leading_ws_len = len(rest) - len(stripped)

    headers = [
        "function",
        "async function",
    ]

    matched_header = None
    for header in headers:
        if stripped.startswith(header):
            matched_header = header
            break

    if not matched_header:
        return None

    pos = len(matched_header)
    while pos < len(stripped) and stripped[pos].isspace():
        pos += 1

    if pos >= len(stripped) or stripped[pos] != "(":
        return None

    # find matching ')'
    paren_depth = 0
    i = pos
    in_single = False
    in_double = False
    in_template = False
    in_line_comment = False
    in_block_comment = False
    escaped = False

    while i < len(stripped):
        ch = stripped[i]
        nxt = stripped[i + 1] if i + 1 < len(stripped) else ""

        if in_line_comment:
            if ch == "\n":
                in_line_comment = False
            i += 1
            continue

        if in_block_comment:
            if ch == "*" and nxt == "/":
                in_block_comment = False
                i += 2
                continue
            i += 1
            continue

        if in_single:
            if escaped:
                escaped = False
            elif ch == "\\":
                escaped = True
            elif ch == "'":
                in_single = False
            i += 1
            continue

        if in_double:
            if escaped:
                escaped = False
            elif ch == "\\":
                escaped = True
            elif ch == '"':
                in_double = False
            i += 1
            continue

        if in_template:
            if escaped:
                escaped = False
            elif ch == "\\":
                escaped = True
            elif ch == "`":
                in_template = False
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
            i += 1
            continue

        if ch == '"':
            in_double = True
            i += 1
            continue

        if ch == "`":
            in_template = True
            i += 1
            continue

        if ch == "(":
            paren_depth += 1
        elif ch == ")":
            paren_depth -= 1
            if paren_depth == 0:
                i += 1
                break

        i += 1

    if paren_depth != 0:
        return None

    while i < len(stripped) and stripped[i].isspace():
        i += 1

    if i >= len(stripped) or stripped[i] != "{":
        return None

    open_brace = i
    close_brace = find_matching_brace(stripped, open_brace)

    header = stripped[:open_brace].rstrip()
    body = stripped[open_brace + 1:close_brace]
    trailing = stripped[close_brace + 1:].strip()

    return leading_comment, header, body, trailing


def minify_file_content(text: str) -> str:
    wrapper = try_split_wrapped_function(text)

    if wrapper is not None:
        leading_comment, header, body, trailing = wrapper
        min_body = minify_js_simple(body)
        parts = []
        if leading_comment.strip():
            parts.append(leading_comment.strip())
        parts.append(f"{header}{{{min_body}}}")
        if trailing:
            parts.append(trailing)
        return "\n".join(parts) + "\n"

    # plain JS fallback
    leading_comment, rest = extract_leading_comment(text)
    minified = minify_js_simple(rest)

    if leading_comment.strip():
        return leading_comment.strip() + "\n" + minified + "\n"
    return minified + "\n"


def process_file(input_path: Path, output_path: Path):
    source = input_path.read_text(encoding="utf-8", errors="replace")
    result = minify_file_content(source)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(result, encoding="utf-8")


def should_process(path: Path):
    return path.suffix.lower() == ".js" and not path.name.endswith(".min.js")


def main():
    parser = argparse.ArgumentParser(
        description="Recursively minify JS files; preserves wrapper functions when present."
    )
    parser.add_argument("input_dir", help="Root folder containing .js files")
    parser.add_argument("output_dir", help="Folder where minified files will be written")
    parser.add_argument("--in-place", action="store_true", help="Overwrite source files")
    args = parser.parse_args()

    input_dir = Path(args.input_dir).resolve()
    output_dir = Path(args.output_dir).resolve()

    if not input_dir.is_dir():
        print(f"Input directory does not exist or is not a directory: {input_dir}", file=sys.stderr)
        sys.exit(1)

    processed = 0
    failed = 0

    for file_path in input_dir.rglob("*.js"):
        if not should_process(file_path):
            continue

        try:
            if args.in_place:
                out_path = file_path
            else:
                out_path = output_dir / file_path.relative_to(input_dir)

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
