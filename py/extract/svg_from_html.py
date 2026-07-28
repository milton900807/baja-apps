import os
import xml.etree.ElementTree as ET

def extract_svgs_from_xml(xml_file, output_dir="svgs"):
    # Parse the XML file
    tree = ET.parse(xml_file)
    root = tree.getroot()

    # Create output directory if it doesn't exist
    os.makedirs(output_dir, exist_ok=True)

    # SVG namespace (you may need to adjust this if different)
    namespaces = {'svg': "http://www.w3.org/2000/svg"}

    # Find all <svg> elements regardless of namespace
    svgs = root.findall(".//{http://www.w3.org/2000/svg}svg")
    if not svgs:
        print("No <svg> elements found.")
        return

    for i, svg in enumerate(svgs, 1):
        # Wrap SVG in proper XML declaration
        svg_str = ET.tostring(svg, encoding="unicode")
        filename = os.path.join(output_dir, f"svg_{i}.svg")
        with open(filename, "w", encoding="utf-8") as f:
            f.write('<?xml version="1.0" encoding="UTF-8"?>\n')
            f.write(svg_str)
        print(f"Extracted SVG {i} to {filename}")

# Example usage
if __name__ == "__main__":
    xml_path = "input.xml"  # Replace with your XML file path
    extract_svgs_from_xml(xml_path)
