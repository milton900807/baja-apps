import os
import math
from lxml import etree
from copy import deepcopy
from svgpathtools import parse_path, svg2paths2

# Compute bounding box of a path
def path_bbox(path):
    xmin = ymin = float('inf')
    xmax = ymax = float('-inf')
    for seg in path:
        box = seg.bbox()
        xmin = min(xmin, box[0])
        xmax = max(xmax, box[1])
        ymin = min(ymin, box[2])
        ymax = max(ymax, box[3])
    return xmin, ymin, xmax, ymax

# Group elements based on bounding box overlap or proximity
def group_elements(bboxes, threshold=5):
    groups = []
    used = [False] * len(bboxes)

    for i in range(len(bboxes)):
        if used[i]:
            continue
        group = [i]
        used[i] = True
        xi1, yi1, xi2, yi2 = bboxes[i]

        changed = True
        while changed:
            changed = False
            for j in range(len(bboxes)):
                if used[j]:
                    continue
                xj1, yj1, xj2, yj2 = bboxes[j]
                # Check for bbox overlap with some tolerance
                if not (xj2 + threshold < xi1 or xj1 - threshold > xi2 or
                        yj2 + threshold < yi1 or yj1 - threshold > yi2):
                    group.append(j)
                    used[j] = True
                    xi1 = min(xi1, xj1)
                    yi1 = min(yi1, yj1)
                    xi2 = max(xi2, xj2)
                    yi2 = max(yi2, yj2)
                    changed = True
        groups.append(group)
    return groups

def extract_icons_from_svg(svg_file, output_dir):
    os.makedirs(output_dir, exist_ok=True)

    # Load SVG paths and attributes
    paths, attrs, svg_attr = svg2paths2(svg_file)

    # Compute bounding boxes
    bboxes = []
    for path in paths:
        xmin, xmax, ymin, ymax = path_bbox(path)
        bboxes.append((xmin, ymin, xmax, ymax))

    # Group paths into icons
    groups = group_elements(bboxes, threshold=5)

    # Load full XML
    parser = etree.XMLParser(remove_blank_text=True)
    tree = etree.parse(svg_file, parser)
    root = tree.getroot()

    svg_ns = "http://www.w3.org/2000/svg"
    etree.register_namespace('', svg_ns)

    all_elements = root.findall(".//*")

    for idx, group in enumerate(groups):
        new_svg = etree.Element("{%s}svg" % svg_ns, nsmap=root.nsmap)
        x1 = min(bboxes[i][0] for i in group)
        y1 = min(bboxes[i][1] for i in group)
        x2 = max(bboxes[i][2] for i in group)
        y2 = max(bboxes[i][3] for i in group)

        width = x2 - x1
        height = y2 - y1

        new_svg.set("width", str(width))
        new_svg.set("height", str(height))
        new_svg.set("viewBox", f"{x1} {y1} {width} {height}")

        for i in group:
            path_element = etree.Element("path")
            path_element.set("d", attrs[i]['d'])
            for k, v in attrs[i].items():
                if k != "d":
                    path_element.set(k, v)
            new_svg.append(path_element)

        out_file = os.path.join(output_dir, f"icon_{idx+1}.svg")
        with open(out_file, 'wb') as f:
            f.write(etree.tostring(new_svg, pretty_print=True, xml_declaration=True, encoding='utf-8'))

    print(f"✅ Extracted {len(groups)} icons to: {output_dir}")

# === Example usage ===
extract_icons_from_svg("output.svg", "extracted_icons")
