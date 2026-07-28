import os
import sys
import argparse
import re
from lxml import etree

PADDING = 5  # pixel padding around the bounding box

def parse_path_bounds(d_attr):
    commands = re.findall(r"[MLHVZmlhvz]|-?\d+\.?\d*(?:e[+-]?\d+)?", d_attr)
    points = []
    i = 0
    last_x = last_y = 0

    while i < len(commands):
        cmd = commands[i]
        if cmd.upper() in ['M', 'L']:
            x = float(commands[i + 1])
            y = float(commands[i + 2])
            if cmd.islower():
                x += last_x
                y += last_y
            points.append((x, y))
            last_x, last_y = x, y
            i += 3
        elif cmd.upper() == 'H':
            x = float(commands[i + 1])
            if cmd.islower():
                x += last_x
            last_x = x
            points.append((x, last_y))
            i += 2
        elif cmd.upper() == 'V':
            y = float(commands[i + 1])
            if cmd.islower():
                y += last_y
            last_y = y
            points.append((last_x, y))
            i += 2
        else:
            i += 1
    return points

def get_bounds(svg_root):
    all_points = []
    for elem in svg_root.xpath("//*[local-name()='path']"):
        d = elem.get("d")
        if d:
            points = parse_path_bounds(d)
            all_points.extend(points)
    if not all_points:
        return None
    min_x = min(x for x, _ in all_points)
    min_y = min(y for _, y in all_points)
    max_x = max(x for x, _ in all_points)
    max_y = max(y for _, y in all_points)
    return min_x, min_y, max_x, max_y

def make_square_bounds_with_padding(min_x, min_y, max_x, max_y, padding=5):
    width = max_x - min_x
    height = max_y - min_y
    size = max(width, height) + 2 * padding
    cx = (min_x + max_x) / 2
    cy = (min_y + max_y) / 2
    new_min_x = cx - size / 2
    new_min_y = cy - size / 2
    return new_min_x, new_min_y, size

def trim_and_square_svg(svg_string, padding=5):
    parser = etree.XMLParser(remove_blank_text=True)
    root = etree.fromstring(svg_string.encode("utf-8"), parser)

    bounds = get_bounds(root)
    if not bounds:
        raise ValueError("No graphical content found.")

    min_x, min_y, max_x, max_y = bounds
    sq_min_x, sq_min_y, size = make_square_bounds_with_padding(min_x, min_y, max_x, max_y, padding)

    root.set("viewBox", f"{sq_min_x} {sq_min_y} {size} {size}")
    root.set("width", f"{size}")
    root.set("height", f"{size}")

    return etree.tostring(root, pretty_print=True, encoding="utf-8").decode("utf-8")

def process_svg_file(input_path, output_path, padding=5):
    try:
        with open(input_path, "r", encoding="utf-8") as f:
            svg_content = f.read()
        trimmed = trim_and_square_svg(svg_content, padding)
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(trimmed)
        print(f"✅ Processed: {input_path}")
    except Exception as e:
        print(f"❌ Error processing {input_path}: {e}")

def process_folder(input_folder, output_folder, padding=5):
    os.makedirs(output_folder, exist_ok=True)
    for filename in os.listdir(input_folder):
        if filename.lower().endswith(".svg"):
            in_path = os.path.join(input_folder, filename)
            out_path = os.path.join(output_folder, filename)
            process_svg_file(in_path, out_path, padding)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Trim and square SVG files in a folder with padding.")
    parser.add_argument("input_folder", help="Path to the input folder containing SVG files.")
    parser.add_argument("-o", "--output_folder", default="output_trimmed",
                        help="Path to the output folder. Defaults to 'output_trimmed'.")
    parser.add_argument("-p", "--padding", type=float, default=5,
                        help="Padding in pixels to add around the bounding box (default: 5).")
    args = parser.parse_args()

    if not os.path.isdir(args.input_folder):
        print(f"❌ Error: {args.input_folder} is not a valid folder.")
        sys.exit(1)

    process_folder(args.input_folder, args.output_folder, args.padding)
