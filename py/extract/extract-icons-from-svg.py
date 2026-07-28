import os
from lxml import etree
from copy import deepcopy

def extract_grid_svgs(svg_file, output_dir, icon_width, icon_height, cols, rows):
    os.makedirs(output_dir, exist_ok=True)

    parser = etree.XMLParser(remove_blank_text=True)
    tree = etree.parse(svg_file, parser)
    root = tree.getroot()

    nsmap = root.nsmap
    svg_ns = nsmap.get(None, 'http://www.w3.org/2000/svg')
    svg_tag = f"{{{svg_ns}}}svg"

    full_width = float(root.get("width", icon_width * cols))
    full_height = float(root.get("height", icon_height * rows))

    for row in range(rows):
        for col in range(cols):
            x0 = col * icon_width
            y0 = row * icon_height
            viewBox = f"{x0} {y0} {icon_width} {icon_height}"

            new_svg = etree.Element(svg_tag, nsmap=root.nsmap)
            new_svg.set("xmlns", svg_ns)
            new_svg.set("width", str(icon_width))
            new_svg.set("height", str(icon_height))
            new_svg.set("viewBox", viewBox)

            for child in root:
                # Clone the node and preserve attributes
                new_svg.append(deepcopy(child))

            out_path = os.path.join(output_dir, f"icon_r{row+1}_c{col+1}.svg")
            with open(out_path, "wb") as f:
                f.write(etree.tostring(new_svg, pretty_print=True, xml_declaration=True, encoding="utf-8"))

    print(f"✅ Saved {(rows*cols)} icons to '{output_dir}'.")

# === Usage ===
extract_grid_svgs(
    svg_file="output.svg",
    output_dir="grid_icons",
    icon_width=24,
    icon_height=24,
    cols=5,
    rows=4
)
