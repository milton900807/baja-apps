import cv2
import numpy as np
import base64
import io
import json
from PIL import Image
from ion import works


base64_image_string = works.param(1)

def decode_base64_image(base64_string):
    """Decodes a base64 string into an OpenCV grayscale image."""
    image_data = base64.b64decode(base64_string)
    image = Image.open(io.BytesIO(image_data))
    return cv2.cvtColor(np.array(image), cv2.COLOR_RGB2GRAY)

def detect_lines_from_base64(base64_string):
    """Detects lines in a base64-encoded image and returns JSON data."""
    # Decode the image
    image = decode_base64_image(base64_string)

    # Apply edge detection
    edges = cv2.Canny(image, 50, 150, apertureSize=3)

    # Apply Hough Line Transform
    lines = cv2.HoughLinesP(edges, rho=1, theta=np.pi/180, threshold=100, minLineLength=50, maxLineGap=10)

    # Store line coordinates
    line_data = []

    if lines is not None:
        for line in lines:
            x1, y1, x2, y2 = line[0]
            line_data.append({"x1": x1, "y1": y1, "x2": x2, "y2": y2})

    return json.dumps({"detected_lines": line_data}, indent=4)

json_output = detect_lines_from_base64(base64_image_string)
works.resolve ( json_output )