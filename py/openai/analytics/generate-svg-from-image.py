#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations

import base64
import json
import math
import re
from typing import Any, Dict, List, Optional, Sequence, Tuple

import numpy as np

try:
    import cv2
except Exception:  # pragma: no cover
    cv2 = None  # type: ignore

try:
    from ion import works
except Exception:  # pragma: no cover
    works = None


Point = Tuple[float, float]
IntPoint = Tuple[int, int]


def build_output(payload: Dict[str, Any]) -> Dict[str, Any]:
    return payload


def strip_data_url_prefix(image_b64: str) -> str:
    image_b64 = (image_b64 or "").strip()
    match = re.match(
        r"^data:image/[^;]+;base64,(.*)$",
        image_b64,
        flags=re.IGNORECASE | re.DOTALL,
    )
    if match:
        return match.group(1).strip()
    return image_b64


def decode_base64_image(image_b64: str) -> np.ndarray:
    if cv2 is None:
        raise RuntimeError("opencv-python is not installed")

    cleaned = strip_data_url_prefix(image_b64)
    if not cleaned:
        raise ValueError("Image input is empty")

    try:
        raw = base64.b64decode(cleaned, validate=True)
    except Exception as e:
        raise ValueError(f"Invalid base64 image input: {e}") from e

    arr = np.frombuffer(raw, dtype=np.uint8)
    image = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError("Could not decode the base64 data into an image")

    return image


def _odd(v: int) -> int:
    v = max(1, int(v))
    return v if v % 2 == 1 else v + 1


def estimate_is_line_art(gray: np.ndarray) -> bool:
    flat = gray.reshape(-1)
    if flat.size == 0:
        return False
    p01 = float(np.percentile(flat, 1))
    p10 = float(np.percentile(flat, 10))
    p50 = float(np.percentile(flat, 50))
    p90 = float(np.percentile(flat, 90))
    p99 = float(np.percentile(flat, 99))

    dynamic = p99 - p01
    dark_mass = float(np.mean(flat < 110))
    bright_mass = float(np.mean(flat > 200))

    return dynamic > 120 and bright_mass > 0.25 and dark_mass < 0.35 and (p90 - p10) > 90 and p50 > 150


def gentle_percentile_normalize(gray: np.ndarray, low_pct: float = 1.0, high_pct: float = 99.0) -> np.ndarray:
    low = float(np.percentile(gray, low_pct))
    high = float(np.percentile(gray, high_pct))
    if high <= low + 1:
        return gray.copy()
    scaled = (gray.astype(np.float32) - low) * (255.0 / (high - low))
    return np.clip(scaled, 0, 255).astype(np.uint8)


def preprocess_for_line_art(
    image: np.ndarray,
    line_art_mode: bool = True,
    preserve_binary: bool = True,
    use_clahe: bool = False,
    clahe_clip_limit: float = 1.6,
    clahe_tile_grid_size: int = 8,
    median_blur: int = 3,
    gaussian_blur: int = 0,
    sharpen_amount: float = 0.0,
) -> Tuple[np.ndarray, np.ndarray]:
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

    if line_art_mode:
        processed = gray.copy()
        if preserve_binary and estimate_is_line_art(gray):
            processed = gray.copy()
        else:
            processed = gentle_percentile_normalize(gray, 1.0, 99.0)
            if use_clahe:
                clahe = cv2.createCLAHE(
                    clipLimit=max(0.1, clahe_clip_limit),
                    tileGridSize=(max(1, clahe_tile_grid_size), max(1, clahe_tile_grid_size)),
                )
                processed = clahe.apply(processed)

        if median_blur > 1:
            processed = cv2.medianBlur(processed, _odd(median_blur))
        if gaussian_blur > 1:
            processed = cv2.GaussianBlur(processed, (_odd(gaussian_blur), _odd(gaussian_blur)), 0)

        if sharpen_amount > 0:
            softened = cv2.GaussianBlur(processed, (3, 3), 0)
            processed = cv2.addWeighted(processed, 1.0 + sharpen_amount, softened, -sharpen_amount, 0)

        return gray, processed

    processed = gray.copy()
    if use_clahe:
        clahe = cv2.createCLAHE(
            clipLimit=max(0.1, clahe_clip_limit),
            tileGridSize=(max(1, clahe_tile_grid_size), max(1, clahe_tile_grid_size)),
        )
        processed = clahe.apply(processed)
    processed = gentle_percentile_normalize(processed, 1.0, 99.0)
    if gaussian_blur > 1:
        processed = cv2.GaussianBlur(processed, (_odd(gaussian_blur), _odd(gaussian_blur)), 0)
    if sharpen_amount > 0:
        softened = cv2.GaussianBlur(processed, (3, 3), 0)
        processed = cv2.addWeighted(processed, 1.0 + sharpen_amount, softened, -sharpen_amount, 0)
    return gray, processed


def dark_line_mask(
    gray: np.ndarray,
    adaptive_block_size: int = 31,
    adaptive_c: int = 12,
    open_iterations: int = 0,
    close_iterations: int = 1,
    min_component_area: int = 6,
) -> np.ndarray:
    block_size = _odd(max(3, adaptive_block_size))
    inv = cv2.bitwise_not(gray)

    otsu_thresh, otsu = cv2.threshold(inv, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    adaptive = cv2.adaptiveThreshold(
        inv,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY,
        block_size,
        adaptive_c,
    )

    mask = cv2.bitwise_or(otsu, adaptive)

    kernel = np.ones((3, 3), np.uint8)
    if open_iterations > 0:
        mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel, iterations=open_iterations)
    if close_iterations > 0:
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel, iterations=close_iterations)

    if min_component_area > 1:
        num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)
        cleaned = np.zeros_like(mask)
        for i in range(1, num_labels):
            area = int(stats[i, cv2.CC_STAT_AREA])
            if area >= min_component_area:
                cleaned[labels == i] = 255
        mask = cleaned

    return mask


def hybrid_edges_from_mask(
    processed_gray: np.ndarray,
    line_mask: np.ndarray,
    low_thresholds: List[int],
    high_thresholds: List[int],
    dilate_iterations: int = 0,
) -> np.ndarray:
    edge_maps: List[np.ndarray] = []
    for low, high in zip(low_thresholds, high_thresholds):
        if low >= high:
            continue
        edge_maps.append(cv2.Canny(processed_gray, low, high))

    if not edge_maps:
        raise ValueError("No valid Canny threshold pairs were provided")

    merged = edge_maps[0].copy()
    for e in edge_maps[1:]:
        merged = cv2.bitwise_or(merged, e)

    mask_edges = cv2.morphologyEx(line_mask, cv2.MORPH_GRADIENT, np.ones((3, 3), np.uint8))
    merged = cv2.bitwise_or(merged, mask_edges)

    if dilate_iterations > 0:
        kernel = np.ones((3, 3), np.uint8)
        merged = cv2.dilate(merged, kernel, iterations=dilate_iterations)

    return merged


def contour_length(points: Sequence[IntPoint]) -> float:
    if len(points) < 2:
        return 0.0
    total = 0.0
    for i in range(1, len(points)):
        dx = points[i][0] - points[i - 1][0]
        dy = points[i][1] - points[i - 1][1]
        total += math.hypot(dx, dy)
    return total


def is_closed_contour(points: Sequence[IntPoint], distance_threshold: float = 3.0) -> bool:
    if len(points) < 3:
        return False
    dx = points[0][0] - points[-1][0]
    dy = points[0][1] - points[-1][1]
    return math.hypot(dx, dy) <= distance_threshold


def detect_contours(edges: np.ndarray, min_points: int = 8) -> List[List[IntPoint]]:
    contours, _ = cv2.findContours(edges, cv2.RETR_LIST, cv2.CHAIN_APPROX_NONE)

    result: List[List[IntPoint]] = []
    for contour in contours:
        if contour is None or len(contour) < min_points:
            continue
        pts = [(int(p[0][0]), int(p[0][1])) for p in contour]
        if len(pts) >= min_points:
            result.append(pts)
    return result


def simplify_polygon(points: Sequence[IntPoint], epsilon: float) -> List[IntPoint]:
    if len(points) < 3:
        return list(points)

    arr = np.array(points, dtype=np.int32).reshape((-1, 1, 2))
    approx = cv2.approxPolyDP(arr, epsilon, closed=True)
    return [(int(p[0][0]), int(p[0][1])) for p in approx]


def simplify_polyline(points: Sequence[IntPoint], epsilon: float) -> List[IntPoint]:
    if len(points) < 2:
        return list(points)

    arr = np.array(points, dtype=np.int32).reshape((-1, 1, 2))
    approx = cv2.approxPolyDP(arr, epsilon, closed=False)
    return [(int(p[0][0]), int(p[0][1])) for p in approx]


def catmull_rom_to_bezier_path(points: Sequence[IntPoint], closed: bool = False) -> str:
    if not points:
        return ""
    if len(points) == 1:
        x, y = points[0]
        return f"M {x:.2f} {y:.2f}"
    if len(points) == 2:
        x0, y0 = points[0]
        x1, y1 = points[1]
        return f"M {x0:.2f} {y0:.2f} L {x1:.2f} {y1:.2f}"

    pts: List[Point] = [(float(x), float(y)) for x, y in points]

    if closed:
        pts_ext = [pts[-1]] + pts + [pts[0], pts[1]]
    else:
        pts_ext = [pts[0]] + pts + [pts[-1]]

    commands = [f"M {pts[0][0]:.2f} {pts[0][1]:.2f}"]

    segment_count = len(pts) if closed else len(pts) - 1
    for i in range(segment_count):
        p0 = pts_ext[i]
        p1 = pts_ext[i + 1]
        p2 = pts_ext[i + 2]
        p3 = pts_ext[i + 3]

        c1x = p1[0] + (p2[0] - p0[0]) / 6.0
        c1y = p1[1] + (p2[1] - p0[1]) / 6.0
        c2x = p2[0] - (p3[0] - p1[0]) / 6.0
        c2y = p2[1] - (p3[1] - p1[1]) / 6.0

        commands.append(
            f"C {c1x:.2f} {c1y:.2f}, {c2x:.2f} {c2y:.2f}, {p2[0]:.2f} {p2[1]:.2f}"
        )

    if closed:
        commands.append("Z")

    return " ".join(commands)


def polygon_to_svg(points: Sequence[IntPoint]) -> str:
    if not points:
        return ""
    return " ".join(f"{x},{y}" for x, y in points)


def svg_escape_color(value: str) -> str:
    return (value or "black").replace('"', "").strip() or "black"


def contour_area(points: Sequence[IntPoint]) -> float:
    if len(points) < 3:
        return 0.0
    arr = np.array(points, dtype=np.float32)
    return abs(cv2.contourArea(arr.reshape((-1, 1, 2))))


def mean_radius_error(points: Sequence[IntPoint], cx: float, cy: float, radius: float) -> float:
    if not points or radius <= 0:
        return float("inf")
    errs = []
    for x, y in points:
        d = math.hypot(x - cx, y - cy)
        errs.append(abs(d - radius) / radius)
    return float(np.mean(errs)) if errs else float("inf")


def ellipse_fit_error(points: Sequence[IntPoint], ellipse: Tuple[Tuple[float, float], Tuple[float, float], float]) -> float:
    if len(points) < 5:
        return float("inf")

    (cx, cy), (w, h), angle_deg = ellipse
    if w <= 0 or h <= 0:
        return float("inf")

    a = w / 2.0
    b = h / 2.0
    if a <= 0 or b <= 0:
        return float("inf")

    angle = math.radians(angle_deg)
    cos_a = math.cos(angle)
    sin_a = math.sin(angle)

    errs = []
    for x, y in points:
        dx = x - cx
        dy = y - cy

        xr = dx * cos_a + dy * sin_a
        yr = -dx * sin_a + dy * cos_a

        v = (xr * xr) / (a * a) + (yr * yr) / (b * b)
        errs.append(abs(v - 1.0))

    return float(np.mean(errs)) if errs else float("inf")


def detect_circle_from_contour(
    points: Sequence[IntPoint],
    min_points: int = 12,
    max_mean_error: float = 0.12,
    circle_axis_ratio_tol: float = 0.12,
) -> Optional[Dict[str, float]]:
    if len(points) < min_points:
        return None

    arr = np.array(points, dtype=np.float32).reshape((-1, 1, 2))
    (cx, cy), radius = cv2.minEnclosingCircle(arr)
    if radius <= 1:
        return None

    err = mean_radius_error(points, cx, cy, radius)
    if err > max_mean_error:
        return None

    if len(points) >= 5:
        try:
            ellipse = cv2.fitEllipse(arr)
            (_, _), (w, h), _ = ellipse
            if w <= 0 or h <= 0:
                return None
            axis_ratio = min(w, h) / max(w, h)
            if axis_ratio < (1.0 - circle_axis_ratio_tol):
                return None
        except Exception:
            pass

    return {
        "cx": float(cx),
        "cy": float(cy),
        "r": float(radius),
        "fit_error": float(err),
    }


def detect_ellipse_from_contour(
    points: Sequence[IntPoint],
    min_points: int = 16,
    max_fit_error: float = 0.18,
    min_axis_ratio: float = 0.35,
    circle_promote_ratio: float = 0.92,
) -> Optional[Dict[str, float]]:
    if len(points) < min_points:
        return None

    arr = np.array(points, dtype=np.float32).reshape((-1, 1, 2))

    try:
        ellipse = cv2.fitEllipse(arr)
    except Exception:
        return None

    (cx, cy), (w, h), angle = ellipse
    if w <= 2 or h <= 2:
        return None

    major = max(w, h)
    minor = min(w, h)
    if major <= 0:
        return None

    axis_ratio = minor / major
    if axis_ratio < min_axis_ratio:
        return None

    if axis_ratio >= circle_promote_ratio:
        return None

    err = ellipse_fit_error(points, ellipse)
    if err > max_fit_error:
        return None

    rx = w / 2.0
    ry = h / 2.0

    return {
        "cx": float(cx),
        "cy": float(cy),
        "rx": float(rx),
        "ry": float(ry),
        "rotation": float(angle),
        "fit_error": float(err),
    }


def ellipse_to_path(cx: float, cy: float, rx: float, ry: float, rotation_deg: float) -> str:
    return (
        f'M {cx - rx:.2f} {cy:.2f} '
        f'A {rx:.2f} {ry:.2f} {rotation_deg:.2f} 0 1 {cx + rx:.2f} {cy:.2f} '
        f'A {rx:.2f} {ry:.2f} {rotation_deg:.2f} 0 1 {cx - rx:.2f} {cy:.2f} Z'
    )


def dedupe_shapes(
    circles: List[Dict[str, float]],
    ellipses: List[Dict[str, float]],
    polygons: List[List[IntPoint]],
    lines: List[Tuple[List[IntPoint], bool]],
) -> Tuple[List[Dict[str, float]], List[Dict[str, float]], List[List[IntPoint]], List[Tuple[List[IntPoint], bool]]]:
    unique_circles: List[Dict[str, float]] = []
    for c in sorted(circles, key=lambda x: (x["fit_error"], -x["r"])):
        keep = True
        for u in unique_circles:
            dist = math.hypot(c["cx"] - u["cx"], c["cy"] - u["cy"])
            if dist < 2.0 and abs(c["r"] - u["r"]) < 2.0:
                keep = False
                break
        if keep:
            unique_circles.append(c)

    unique_ellipses: List[Dict[str, float]] = []
    for e in sorted(ellipses, key=lambda x: x["fit_error"]):
        keep = True
        for u in unique_ellipses:
            dist = math.hypot(e["cx"] - u["cx"], e["cy"] - u["cy"])
            if dist < 2.0 and abs(e["rx"] - u["rx"]) < 2.0 and abs(e["ry"] - u["ry"]) < 2.0:
                keep = False
                break
        if keep:
            unique_ellipses.append(e)

    return unique_circles, unique_ellipses, polygons, lines


def build_vector_layers(
    contours: List[List[IntPoint]],
    polygon_epsilon: float,
    line_epsilon: float,
    min_polygon_area: float,
    min_line_length: float,
    circle_error_threshold: float,
    ellipse_error_threshold: float,
) -> Tuple[
    List[Dict[str, float]],
    List[Dict[str, float]],
    List[List[IntPoint]],
    List[Tuple[List[IntPoint], bool]],
]:
    circles: List[Dict[str, float]] = []
    ellipses: List[Dict[str, float]] = []
    polygons: List[List[IntPoint]] = []
    lines: List[Tuple[List[IntPoint], bool]] = []

    for pts in contours:
        closed = is_closed_contour(pts)
        area = contour_area(pts)
        length = contour_length(pts)

        if closed and area >= min_polygon_area:
            # Prefer ellipse fitting before circle fitting so slightly elongated
            # atom labels/rings/loops are not prematurely forced into circles.
            ellipse = detect_ellipse_from_contour(pts, max_fit_error=ellipse_error_threshold)
            if ellipse is not None:
                ellipses.append(ellipse)
                continue

            circle = detect_circle_from_contour(pts, max_mean_error=circle_error_threshold)
            if circle is not None:
                circles.append(circle)
                continue

            poly = simplify_polygon(pts, polygon_epsilon)
            if len(poly) >= 3:
                polygons.append(poly)
                continue

        if length >= min_line_length:
            simp = simplify_polyline(pts, line_epsilon)
            if len(simp) >= 2:
                lines.append((simp, closed))

    return dedupe_shapes(circles, ellipses, polygons, lines)


def detailed_svg(
    width: int,
    height: int,
    circles: List[Dict[str, float]],
    ellipses: List[Dict[str, float]],
    polygons: List[List[IntPoint]],
    smooth_lines: List[Tuple[List[IntPoint], bool]],
    background: str = "white",
    stroke: str = "black",
    shape_stroke_width: float = 1.0,
    polygon_stroke_width: float = 1.0,
    line_stroke_width: float = 1.0,
    polygon_fill: str = "none",
) -> str:
    background = svg_escape_color(background)
    stroke = svg_escape_color(stroke)
    polygon_fill = svg_escape_color(polygon_fill)

    parts = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        (
            f'<svg xmlns="http://www.w3.org/2000/svg" '
            f'width="{width}" height="{height}" viewBox="0 0 {width} {height}" '
            f'version="1.1">'
        ),
        f'<rect x="0" y="0" width="{width}" height="{height}" fill="{background}" />',
    ]

    parts.append(
        f'<g stroke="{stroke}" fill="{polygon_fill}" '
        f'stroke-width="{shape_stroke_width}" stroke-linejoin="round" opacity="1.0">'
    )
    for c in circles:
        parts.append(f'<circle cx="{c["cx"]:.2f}" cy="{c["cy"]:.2f}" r="{c["r"]:.2f}" />')
    for e in ellipses:
        d = ellipse_to_path(e["cx"], e["cy"], e["rx"], e["ry"], e["rotation"])
        parts.append(f'<path d="{d}" />')
    parts.append("</g>")

    parts.append(
        f'<g stroke="{stroke}" fill="{polygon_fill}" '
        f'stroke-width="{polygon_stroke_width}" stroke-linejoin="round" opacity="1.0">'
    )
    for poly in polygons:
        pts = polygon_to_svg(poly)
        if pts:
            parts.append(f'<polygon points="{pts}" />')
    parts.append("</g>")

    parts.append(
        f'<g stroke="{stroke}" fill="none" '
        f'stroke-width="{line_stroke_width}" stroke-linecap="round" '
        f'stroke-linejoin="round" opacity="1.0">'
    )
    for pts, closed in smooth_lines:
        d = catmull_rom_to_bezier_path(pts, closed=closed)
        if d:
            parts.append(f'<path d="{d}" />')
    parts.append("</g>")

    parts.append("</svg>")
    return "\n".join(parts)


def image_to_svg_output(params: Dict[str, Any]) -> Dict[str, Any]:
    image_b64 = str(params.get("image_base64") or "")

    # Preprocess tuned for higher-detail black/white line drawings and molecular stick diagrams.
    # These defaults preserve more micro-structure so downstream curve fitting has denser control points.
    line_art_mode = bool(params.get("line_art_mode", True))
    preserve_binary = bool(params.get("preserve_binary", True))
    use_clahe = bool(params.get("use_clahe", False))
    clahe_clip_limit = float(params.get("clahe_clip_limit", 1.4))
    clahe_tile_grid_size = int(params.get("clahe_tile_grid_size", 8))
    median_blur = int(params.get("median_blur", 1))
    gaussian_blur = int(params.get("gaussian_blur", 0))
    sharpen_amount = float(params.get("sharpen_amount", 0.0))

    # Thresholding and cleanup for dark strokes on bright backgrounds.
    # Lower cleanup thresholds keep thin bonds and tiny marks instead of discarding them.
    adaptive_block_size = int(params.get("adaptive_block_size", 25))
    adaptive_c = int(params.get("adaptive_c", 8))
    open_iterations = int(params.get("open_iterations", 0))
    close_iterations = int(params.get("close_iterations", 1))
    min_component_area = int(params.get("min_component_area", 3))

    # Edge extraction.
    # Lower thresholds retain finer stroke detail and weaker edges.
    low_thresholds = params.get("low_thresholds", [6, 12, 20])
    high_thresholds = params.get("high_thresholds", [30, 55, 90])
    dilate_iterations = int(params.get("dilate_iterations", 0))

    # Geometry shaping.
    # Lower epsilons preserve more contour points, which gives smoother / stronger interpolation.
    polygon_epsilon = float(params.get("polygon_epsilon", 1.0))
    line_epsilon = float(params.get("line_epsilon", 0.5))
    min_polygon_area = float(params.get("min_polygon_area", 18.0))
    min_line_length = float(params.get("min_line_length", 5.0))

    # Shape detection.
    circle_error_threshold = float(params.get("circle_error_threshold", 0.10))
    ellipse_error_threshold = float(params.get("ellipse_error_threshold", 0.16))

    # Styling.
    shape_stroke_width = float(params.get("shape_stroke_width", 1.0))
    polygon_stroke_width = float(params.get("polygon_stroke_width", 1.0))
    line_stroke_width = float(params.get("line_stroke_width", 1.0))
    background = str(params.get("background", "white"))
    stroke = str(params.get("stroke", "black"))
    polygon_fill = str(params.get("polygon_fill", "none"))

    if not image_b64.strip():
        return build_output({
            "ok": False,
            "error": "image_base64 is empty.",
            "title": "",
            "description": "",
            "width": 0,
            "height": 0,
            "circle_count": 0,
            "ellipse_count": 0,
            "polygon_count": 0,
            "path_count": 0,
            "svg": "",
        })

    try:
        image = decode_base64_image(image_b64)
        height, width = image.shape[:2]

        if not isinstance(low_thresholds, list) or not isinstance(high_thresholds, list):
            raise ValueError("low_thresholds and high_thresholds must both be arrays")
        if len(low_thresholds) != len(high_thresholds):
            raise ValueError("low_thresholds and high_thresholds must be the same length")

        low_thresholds = [int(v) for v in low_thresholds]
        high_thresholds = [int(v) for v in high_thresholds]

        original_gray, processed_gray = preprocess_for_line_art(
            image=image,
            line_art_mode=line_art_mode,
            preserve_binary=preserve_binary,
            use_clahe=use_clahe,
            clahe_clip_limit=clahe_clip_limit,
            clahe_tile_grid_size=clahe_tile_grid_size,
            median_blur=median_blur,
            gaussian_blur=gaussian_blur,
            sharpen_amount=sharpen_amount,
        )

        line_mask = dark_line_mask(
            gray=processed_gray if line_art_mode else original_gray,
            adaptive_block_size=adaptive_block_size,
            adaptive_c=adaptive_c,
            open_iterations=open_iterations,
            close_iterations=close_iterations,
            min_component_area=min_component_area,
        )

        edges = hybrid_edges_from_mask(
            processed_gray=processed_gray,
            line_mask=line_mask,
            low_thresholds=low_thresholds,
            high_thresholds=high_thresholds,
            dilate_iterations=dilate_iterations,
        )

        contours = detect_contours(edges, min_points=8)

        circles, ellipses, polygons, smooth_lines = build_vector_layers(
            contours=contours,
            polygon_epsilon=polygon_epsilon,
            line_epsilon=line_epsilon,
            min_polygon_area=min_polygon_area,
            min_line_length=min_line_length,
            circle_error_threshold=circle_error_threshold,
            ellipse_error_threshold=ellipse_error_threshold,
        )

        svg = detailed_svg(
            width=width,
            height=height,
            circles=circles,
            ellipses=ellipses,
            polygons=polygons,
            smooth_lines=smooth_lines,
            background=background,
            stroke=stroke,
            shape_stroke_width=shape_stroke_width,
            polygon_stroke_width=polygon_stroke_width,
            line_stroke_width=line_stroke_width,
            polygon_fill=polygon_fill,
        )

        return build_output({
            "ok": True,
            "title": "Line-art aware SVG extraction",
            "description": (
                "SVG generated with a line-art friendly pipeline for black-and-white stick drawings. "
                "It avoids aggressive contrast boosting by default, segments dark strokes with hybrid "
                "adaptive/Otsu thresholding, merges those results with mild multi-threshold Canny edges, "
                "and then emits circles, ellipses, polygons, and smooth Bézier paths."
            ),
            "width": int(width),
            "height": int(height),
            "circle_count": len(circles),
            "ellipse_count": len(ellipses),
            "polygon_count": len(polygons),
            "path_count": len(smooth_lines),
            "svg": svg,
        })

    except Exception as e:
        return build_output({
            "ok": False,
            "error": str(e),
            "title": "",
            "description": "",
            "width": 0,
            "height": 0,
            "circle_count": 0,
            "ellipse_count": 0,
            "polygon_count": 0,
            "path_count": 0,
            "svg": "",
        })


def _main() -> int:
    if works is not None:
        raw_input = works.param(1)
        if isinstance(raw_input, dict):
            params = raw_input
        else:
            params = {"image_base64": str(raw_input or "")}
        works.resolve(image_to_svg_output(params))
        return 0

    import sys

    if len(sys.argv) > 1:
        params = {"image_base64": sys.argv[1]}
    else:
        params = {"image_base64": ""}

    print(json.dumps(image_to_svg_output(params), indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(_main())
