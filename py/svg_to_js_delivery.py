import os
import base64

LICENSE_HEADER = """/*
 * bajabio Precision Therapeutics License
 *
 * Copyright (c) 2024 bajabio, Inc.
 *
 * Permission is hereby granted to any person obtaining a copy of this software (the "Software") to use, copy, and modify the Software, subject to the following conditions:
 *
 * 1. Modifications:
 *    - Modifications to the Software are permitted.
 *    - Modified versions of the Software may be used only for personal or internal business purposes.
 *
 * 2. Redistribution:
 *    - Redistribution of the original or modified versions of the Software, in whole or in part, in any form, is not permitted without the prior written consent of bajabio, Inc.
 *
 * 3. Attribution:
 *    - The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 *
 * 4. Warranty Disclaimer:
 *    - THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES, OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT, OR OTHERWISE, ARISING FROM, OUT OF, OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 *
 * 5. Termination:
 *    - This License shall automatically terminate if you fail to comply with its terms.
 */
"""

def svg_to_js(svg_path):
    with open(svg_path, "r", encoding="utf-8") as f:
        svg_content = f.read()

    encoded = base64.b64encode(svg_content.encode('utf-8')).decode('ascii')

    js_func = f"""{LICENSE_HEADER}

function () {{
  let _svg = `{svg_content}`
  let svgData = btoa(unescape(encodeURIComponent(_svg)));
  let svg = 'data:image/svg+xml;base64,' + svgData;
  return svg;
}}
"""
    js_path = os.path.splitext(svg_path)[0] + ".js"
    with open(js_path, "w", encoding="utf-8") as f:
        f.write(js_func)

    print(f"Generated: {js_path}")

def process_directory(root_dir):
    for dirpath, _, filenames in os.walk(root_dir):
        for filename in filenames:
            if filename.lower().endswith(".svg"):
                svg_to_js(os.path.join(dirpath, filename))

# === Run it ===
if __name__ == "__main__":
    import sys
    if len(sys.argv) < 2:
        print("Usage: python generate_svg_js.py <directory>")
    else:
        process_directory(sys.argv[1])
