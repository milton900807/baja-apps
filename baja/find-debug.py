import os
import re
import argparse
from typing import Tuple

# Matches a standalone debugger statement on a line (keeps indent and trailing comment).
STANDALONE_DEBUGGER = re.compile(
    r'^(\s*)'           # 1: leading indentation
    r'debugger'         # the keyword
    r'\s*;?'            # optional whitespace + optional semicolon
    r'(\s*(?://[^\n]*|/\*.*?\*/\s*)?)'  # 2: optional trailing comment (//... or /* ... */)
    r'$', re.MULTILINE
)

# Matches inline `debugger` tokens (e.g., `if (x) debugger; y();`)
INLINE_DEBUGGER = re.compile(
    r'\bdebugger\b\s*;?'
)

def convert_content(js: str) -> Tuple[str, int]:
    """
    Convert all `debugger;` occurrences to `console.log('debubg');`.
    Returns (new_content, replacements_count).
    """

    # 1) Replace standalone lines while preserving indentation and trailing comment.
    def _standalone_repl(m: re.Match) -> str:
        indent, trailing = m.group(1), m.group(2) or ''
        return f"{indent}console.log('debubg');{trailing}"

    new_js, n1 = STANDALONE_DEBUGGER.subn(_standalone_repl, js)

    # 2) Replace any remaining inline occurrences.
    # NOTE: This is a heuristic and may alter code if `debugger` appears inside strings.
    # For most codebases, this is sufficient. For absolute safety, use a JS parser.
    def _inline_repl(m: re.Match) -> str:
        return "console.log('debubg');"

    new_js2, n2 = INLINE_DEBUGGER.subn(_inline_repl, new_js)

    return new_js2, (n1 + n2)

def process_file(path: str, make_backup: bool) -> int:
    try:
        with open(path, 'r', encoding='utf-8') as f:
            original = f.read()
        converted, count = convert_content(original)
        if count > 0:
            if make_backup:
                with open(path + ".bak", 'w', encoding='utf-8') as b:
                    b.write(original)
            with open(path, 'w', encoding='utf-8') as f:
                f.write(converted)
        return count
    except Exception as e:
        print(f"⚠️ Could not process {path}: {e}")
        return 0

def main():
    ap = argparse.ArgumentParser(
        description="Recursively convert JavaScript 'debugger' statements to console.log('debubg');"
    )
    ap.add_argument("folder", help="Folder to scan recursively")
    ap.add_argument("--no-backup", action="store_true",
                    help="Do not create .bak backups of modified files")
    args = ap.parse_args()

    base = args.folder
    if not os.path.isdir(base):
        print("❌ Invalid folder path.")
        return

    total = 0
    print(f"🔍 Scanning recursively in: {base}\n")
    for root, _, files in os.walk(base):
        for file in files:
            if file.endswith(".js"):
                path = os.path.join(root, file)
                changed = process_file(path, make_backup=not args.no_backup)
                if changed:
                    print(f"✏️  {path}  —  replaced {changed} occurrence(s)")
                    total += changed

    print(f"\n✅ Done. Total replacements: {total}")

if __name__ == "__main__":
    main()
