#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Regenerate the Pocket Genes Integraciones PDF brochure.

The script reads the standalone recreation manual, validates the locked copy and
layout requirements, uses the screenshots already present in sample-screenshots,
and writes a fresh six-page 480 x 720 pt PDF.
"""

from __future__ import annotations

import argparse
import math
import random
import shutil
import sys
from pathlib import Path

try:
    from PIL import Image, ImageDraw, ImageFilter
    from reportlab.lib.colors import HexColor
    from reportlab.lib.utils import ImageReader
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfgen import canvas
except ImportError as exc:
    raise SystemExit(
        "Missing dependency. Install reportlab and pillow, then rerun this script."
    ) from exc


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_MANUALS = [
    ROOT / "PocketGenes_Integraciones_Brochure_Recreation_Manual_Standalone_v8_MAX_DETAIL.txt",
    Path.home() / "Downloads" / "PocketGenes_Integraciones_Brochure_Recreation_Manual_Standalone_v8_MAX_DETAIL.txt",
]
DEFAULT_SCREENSHOTS_DIR = ROOT / "sample-screenshots"
DEFAULT_OUTPUT = ROOT / "output" / "pdf" / "PocketGenes_Integraciones_Brochure.pdf"
DEFAULT_TMP_DIR = ROOT / "tmp" / "pdfs" / "create-brochure"

PAGE_W = 480.0
PAGE_H = 720.0
BG_SCALE = 4.1666667

COLORS = {
    "BG_BASE_NAVY": "#020B19",
    "BG_DEEP_BLUE": "#061426",
    "WHITE_MAIN": "#F7FBFF",
    "WHITE_PAGE6": "#F5F8FF",
    "BODY_MUTED": "#C7D2E6",
    "BODY_PAGE6": "#D0DAEA",
    "CAPTION_MUTED": "#8DA0B8",
    "FOOTER_MUTED": "#AAB7C8",
    "ACCENT_CYAN": "#2DD6D8",
    "ACCENT_CYAN_P6": "#2BDADE",
    "ACCENT_PINK": "#FF5A95",
    "ACCENT_PINK_P6": "#FF5C97",
    "ACCENT_PURPLE": "#A855F7",
    "ACCENT_PURPLE_P6": "#B34BFF",
    "ACCENT_GREEN": "#68E19A",
    "ACCENT_GREEN_P6": "#6FE08A",
    "CARD_FILL": "#103B4F",
    "CARD_STROKE": "#206887",
    "CARD_STROKE_LIGHT": "#238AA0",
    "CARD_PURPLE_FILL": "#2B1F4D",
    "TIMELINE_LINE": "#7C879A",
}

REQUIRED_MANUAL_LOCKS = [
    "The brochure has exactly 6 pages.",
    "Every page is exactly 480 pt wide and 720 pt high.",
    "The brochure text uses only Helvetica and Helvetica-Bold.",
    "Page 3 bottom thumbnails are frameless and centered.",
    "Page 6 says Cómo arrancar.",
    "Page 1 says Integraciones.",
    "Integración productiva piloto.",
]

SCREENSHOT_BY_ASSET = {
    "APP_EXPLORE_TEAL": "09.05.25",
    "APP_EXPLORE_RED": "09.05.31",
    "APP_PATHOLOGY_CARDIO": "09.05.40",
    "APP_ANCESTRY": "09.06.01",
    "APP_FILTER_PATHOGENICITY": "09.06.16",
    "APP_PATHOLOGY_NEUROLOGY": "09.06.27",
    "APP_RAREFRIENDS": "09.06.47",
    "APP_INSIGHT_MCM6": "09.07.37",
}


def resolve_manual(path: Path | None) -> Path:
    if path:
        return path.expanduser().resolve()
    for candidate in DEFAULT_MANUALS:
        if candidate.exists():
            return candidate.resolve()
    searched = "\n".join(f"- {p}" for p in DEFAULT_MANUALS)
    raise SystemExit(f"Manual not found. Searched:\n{searched}")


def load_manual(path: Path) -> str:
    if not path.exists():
        raise SystemExit(f"Manual not found: {path}")
    text = path.read_text(encoding="utf-8")
    missing = [lock for lock in REQUIRED_MANUAL_LOCKS if lock not in text]
    if missing:
        joined = "\n".join(f"- {item}" for item in missing)
        raise SystemExit(f"Manual does not contain required locked instructions:\n{joined}")
    return text


def find_screenshots(screenshots_dir: Path) -> dict[str, Path]:
    screenshots_dir = screenshots_dir.expanduser().resolve()
    if not screenshots_dir.exists():
        raise SystemExit(f"Screenshots directory not found: {screenshots_dir}")

    files = sorted(p for p in screenshots_dir.iterdir() if p.is_file() and p.suffix.lower() in {".png", ".jpg", ".jpeg"})
    result: dict[str, Path] = {}
    for asset, timestamp in SCREENSHOT_BY_ASSET.items():
        matches = [p for p in files if timestamp in p.name]
        if not matches:
            raise SystemExit(f"Missing screenshot for {asset}; expected filename containing {timestamp}")
        result[asset] = matches[0]
    return result


def hex_to_rgb(value: str) -> tuple[int, int, int]:
    value = value.strip("#")
    return tuple(int(value[i : i + 2], 16) for i in (0, 2, 4))


def blend(a: tuple[int, int, int], b: tuple[int, int, int], t: float) -> tuple[int, int, int]:
    return tuple(round(a[i] * (1 - t) + b[i] * t) for i in range(3))


def generate_background(path: Path) -> None:
    px_w = int(PAGE_W * BG_SCALE)
    px_h = int(PAGE_H * BG_SCALE)
    top = hex_to_rgb("#061426")
    mid = hex_to_rgb("#051323")
    bottom = hex_to_rgb("#040D1D")
    img = Image.new("RGB", (px_w, px_h), top)
    pix = img.load()

    for y in range(px_h):
        t = y / (px_h - 1)
        color = blend(top, mid, t / 0.52) if t < 0.52 else blend(mid, bottom, (t - 0.52) / 0.48)
        for x in range(px_w):
            pix[x, y] = color

    def radial(center_pt: tuple[float, float], radius_pt: tuple[float, float], color: str, opacity: float) -> Image.Image:
        overlay = Image.new("RGBA", (px_w, px_h), (0, 0, 0, 0))
        opix = overlay.load()
        cx = center_pt[0] * BG_SCALE
        cy = center_pt[1] * BG_SCALE
        rx = radius_pt[0] * BG_SCALE
        ry = radius_pt[1] * BG_SCALE
        r, g, b = hex_to_rgb(color)
        x0 = max(0, int(cx - rx))
        x1 = min(px_w, int(cx + rx))
        y0 = max(0, int(cy - ry))
        y1 = min(px_h, int(cy + ry))
        for yy in range(y0, y1):
            for xx in range(x0, x1):
                distance = ((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2
                if distance <= 1:
                    alpha = int(255 * opacity * (1 - math.sqrt(distance)) ** 1.7)
                    opix[xx, yy] = (r, g, b, alpha)
        return overlay

    img = Image.alpha_composite(img.convert("RGBA"), radial((350, 315), (155, 230), "#0A3940", 0.24))
    img = Image.alpha_composite(img, radial((160, 650), (190, 130), "#241549", 0.22))
    img = Image.alpha_composite(img, radial((410, 670), (170, 150), "#211B46", 0.20))
    draw = ImageDraw.Draw(img, "RGBA")

    def arc(bbox: tuple[float, float, float, float], start: float, end: float, color: str, alpha: float, width: float) -> None:
        x, y, w, h = bbox
        box = [x * BG_SCALE, y * BG_SCALE, (x + w) * BG_SCALE, (y + h) * BG_SCALE]
        draw.arc(box, start=start, end=end, fill=(*hex_to_rgb(color), int(255 * alpha)), width=max(1, int(width * BG_SCALE)))

    arc((178, 86, 380, 305), 196, 358, COLORS["ACCENT_CYAN"], 0.32, 0.75)
    arc((215, 170, 390, 430), 112, 352, COLORS["ACCENT_CYAN"], 0.27, 0.70)
    arc((95, 390, 480, 420), 190, 350, COLORS["ACCENT_CYAN"], 0.22, 0.65)
    arc((250, 245, 260, 280), 84, 325, COLORS["ACCENT_CYAN"], 0.18, 0.45)
    arc((280, 120, 335, 480), 110, 340, COLORS["ACCENT_PURPLE"], 0.22, 0.60)
    arc((300, 450, 300, 330), 130, 335, COLORS["ACCENT_PINK"], 0.16, 0.55)
    arc((345, 75, 260, 280), 150, 345, COLORS["ACCENT_CYAN"], 0.18, 0.50)
    arc((-40, 315, 620, 520), 205, 340, COLORS["ACCENT_CYAN"], 0.12, 0.45)

    rng = random.Random(180623)
    dot_specs = [(70, 0.35, 0.75), (18, 0.8, 1.3), (7, 1.4, 2.0)]
    choices = [
        ("#F7FBFF", 0.75, 0.55),
        (COLORS["ACCENT_CYAN"], 0.55, 0.25),
        (COLORS["ACCENT_PINK"], 0.50, 0.10),
        (COLORS["ACCENT_PURPLE"], 0.50, 0.10),
    ]
    for count, r_min, r_max in dot_specs:
        for _ in range(count):
            for _attempt in range(30):
                x = rng.uniform(18, PAGE_W - 18)
                y = rng.uniform(24, PAGE_H - 30)
                if x < 280 and 80 < y < 230 and rng.random() < 0.72:
                    x = rng.uniform(300, PAGE_W - 18)
                if 650 < y < 710 and 30 < x < 462:
                    continue
                break
            roll = rng.random()
            acc = 0.0
            color, alpha = choices[0][0], choices[0][1]
            for candidate_color, candidate_alpha, probability in choices:
                acc += probability
                if roll <= acc:
                    color, alpha = candidate_color, candidate_alpha
                    break
            radius = rng.uniform(r_min, r_max) * BG_SCALE
            cx = x * BG_SCALE
            cy = y * BG_SCALE
            draw.ellipse([cx - radius, cy - radius, cx + radius, cy + radius], fill=(*hex_to_rgb(color), int(255 * alpha)))

    path.parent.mkdir(parents=True, exist_ok=True)
    img.convert("RGB").save(path, quality=96)


def make_phone(src: Path, width_pt: float, height_pt: float, out: Path) -> None:
    scale = 8
    ow = int(round(width_pt * scale))
    oh = int(round(height_pt * scale))
    img = Image.new("RGBA", (ow + 64, oh + 64), (0, 0, 0, 0))
    shadow = Image.new("RGBA", img.size, (0, 0, 0, 0))
    shadow_draw = ImageDraw.Draw(shadow, "RGBA")
    shadow_draw.rounded_rectangle([38, 40, 38 + ow, 40 + oh], radius=max(24, int(0.13 * ow)), fill=(0, 0, 0, 92))
    img = Image.alpha_composite(img, shadow.filter(ImageFilter.GaussianBlur(16)))
    draw = ImageDraw.Draw(img, "RGBA")
    body = [32, 32, 32 + ow, 32 + oh]
    radius = max(22, int(0.16 * ow))
    draw.rounded_rectangle(body, radius=radius, fill=(26, 38, 52, 255), outline=(91, 127, 149, 210), width=max(2, int(1.5 * scale)))

    source = Image.open(src).convert("RGBA")
    ratio = source.width / source.height
    max_sw = ow - int(10 * scale)
    max_sh = oh - int(10 * scale)
    sw = max_sw
    sh = int(round(sw / ratio))
    if sh > max_sh:
        sh = max_sh
        sw = int(round(sh * ratio))
    sx = 32 + (ow - sw) // 2
    sy = 32 + (oh - sh) // 2
    screen = source.resize((sw, sh), Image.Resampling.LANCZOS)
    mask = Image.new("L", (sw, sh), 0)
    mask_draw = ImageDraw.Draw(mask)
    mask_draw.rounded_rectangle([0, 0, sw, sh], radius=max(16, int(0.10 * sw)), fill=255)
    img.paste(screen, (sx, sy), mask)
    draw.rounded_rectangle([sx, sy, sx + sw, sy + sh], radius=max(16, int(0.10 * sw)), outline=(255, 255, 255, 24), width=max(1, int(0.6 * scale)))
    img.save(out)


def prepare_assets(screenshots: dict[str, Path], tmp_dir: Path) -> dict[str, Path]:
    assets_dir = tmp_dir / "assets"
    assets_dir.mkdir(parents=True, exist_ok=True)
    bg = assets_dir / "BG_MASTER_DARK_DAMP_PORTRAIT.png"
    generate_background(bg)
    assets = {"BG": bg}
    phone_specs = {
        "PHONE_EXPLORE_TEAL_LARGE": (screenshots["APP_EXPLORE_TEAL"], 112, 244),
        "PHONE_EXPLORE_RED_P3": (screenshots["APP_EXPLORE_RED"], 102, 190),
        "PHONE_RAREFRIENDS": (screenshots["APP_RAREFRIENDS"], 82, 178),
        "PHONE_INSIGHT": (screenshots["APP_INSIGHT_MCM6"], 100, 218),
        "PHONE_PATHOLOGY_P6": (screenshots["APP_PATHOLOGY_CARDIO"], 83, 190),
    }
    for name, (src, width, height) in phone_specs.items():
        out = assets_dir / f"{name}.png"
        make_phone(src, width, height, out)
        assets[name] = out
    return assets


def y_top(y: float, h: float = 0.0) -> float:
    return PAGE_H - y - h


def text_top(c: canvas.Canvas, text: str, x: float, y: float, size: float, color: str, font: str = "Helvetica") -> None:
    c.setFont(font, size)
    c.setFillColor(HexColor(color))
    c.drawString(x, PAGE_H - y - size * 0.74, text)


def text_center(c: canvas.Canvas, text: str, cx: float, y: float, size: float, color: str, font: str = "Helvetica") -> None:
    c.setFont(font, size)
    c.setFillColor(HexColor(color))
    width = pdfmetrics.stringWidth(text, font, size)
    c.drawString(cx - width / 2, PAGE_H - y - size * 0.74, text)


def rounded_card(c: canvas.Canvas, x: float, y: float, w: float, h: float, fill: str, stroke: str, alpha: float = 0.92, radius: float = 17) -> None:
    c.saveState()
    c.setFillColor(HexColor(COLORS.get(fill, fill)))
    c.setStrokeColor(HexColor(COLORS.get(stroke, stroke)))
    c.setFillAlpha(alpha)
    c.setStrokeAlpha(0.9)
    c.setLineWidth(1)
    c.roundRect(x, y_top(y, h), w, h, radius, stroke=1, fill=1)
    c.restoreState()


def pill(c: canvas.Canvas, text: str, x: float, y: float, w: float, h: float, fill: str) -> None:
    c.saveState()
    c.setFillColor(HexColor(fill))
    c.roundRect(x, y_top(y, h), w, h, h / 2, stroke=0, fill=1)
    c.restoreState()
    text_center(c, text, x + w / 2, y + 7.0, 10.5, "#FFFFFF", "Helvetica-Bold")


def image_box(c: canvas.Canvas, path: Path, x: float, y: float, w: float, h: float) -> None:
    c.drawImage(ImageReader(str(path)), x, y_top(y, h), w, h, mask="auto")


def image_contain(c: canvas.Canvas, path: Path, x: float, y: float, w: float, h: float) -> None:
    im = Image.open(path)
    ratio = im.width / im.height
    tw = w
    th = tw / ratio
    if th > h:
        th = h
        tw = th * ratio
    image_box(c, path, x + (w - tw) / 2, y + (h - th) / 2, tw, th)


def bg(c: canvas.Canvas, assets: dict[str, Path]) -> None:
    image_box(c, assets["BG"], 0, 0, PAGE_W, PAGE_H)


def footer(c: canvas.Canvas, page: str, color: str = "#FFFFFF", y: float = 694.47, page_x: float = 432.22) -> None:
    text_top(c, "Pocket Genes · brochure", 40, y, 7, color)
    text_top(c, page, page_x, y, 7, color)


def underline_pair(c: canvas.Canvas, x: float = 40, y: float = 145) -> None:
    c.saveState()
    c.setFillColor(HexColor(COLORS["ACCENT_CYAN"]))
    c.roundRect(x, y_top(y, 3), 72, 3, 1.5, stroke=0, fill=1)
    c.setFillColor(HexColor(COLORS["ACCENT_PINK"]))
    c.roundRect(x, y_top(y + 9, 3), 124, 3, 1.5, stroke=0, fill=1)
    c.restoreState()


def dot(c: canvas.Canvas, x: float, y: float, color: str, r: float = 2.8) -> None:
    c.saveState()
    c.setFillColor(HexColor(color))
    c.circle(x, PAGE_H - y, r, stroke=0, fill=1)
    c.restoreState()


def logo(c: canvas.Canvas) -> None:
    coords = [
        (45, 51, COLORS["ACCENT_CYAN"], 4.8),
        (58, 47, COLORS["WHITE_MAIN"], 3.3),
        (69, 55, COLORS["ACCENT_PURPLE"], 4.5),
        (53, 64, COLORS["ACCENT_PINK"], 3.8),
        (67, 71, COLORS["ACCENT_CYAN"], 3.2),
        (42, 74, COLORS["WHITE_MAIN"], 2.6),
    ]
    for x, y, color, radius in coords:
        dot(c, x, y, color, radius)
    text_top(c, "Pocket Genes", 83, 54, 11.5, COLORS["WHITE_MAIN"], "Helvetica-Bold")


def page1(c: canvas.Canvas, assets: dict[str, Path]) -> None:
    bg(c, assets)
    logo(c)
    underline_pair(c, 40, 245)
    rounded_card(c, 40, 580, 280, 85, "CARD_FILL", "CARD_STROKE_LIGHT", 0.93)
    pill(c, "Piloto $0", 40, 400, 75, 25, COLORS["ACCENT_PINK"])
    pill(c, "2 meses", 128, 400, 78, 25, "#116274")
    pill(c, "Co-diseño", 40, 440, 98, 25, COLORS["ACCENT_PURPLE"])
    image_box(c, assets["PHONE_INSIGHT"], 392, 205, 100, 218)
    image_box(c, assets["PHONE_EXPLORE_TEAL_LARGE"], 306, 174, 112, 244)
    image_box(c, assets["PHONE_RAREFRIENDS"], 326, 330, 82, 178)
    text_top(c, "Pocket Genes x", 40, 150, 31, COLORS["WHITE_MAIN"], "Helvetica-Bold")
    text_top(c, "Integraciones", 40, 190.83, 31, COLORS["ACCENT_CYAN"], "Helvetica-Bold")
    text_top(c, "Reporte interactivo", 40, 285, 8, COLORS["ACCENT_PINK"], "Helvetica-Bold")
    text_top(c, "Co-diseñamos una forma mobile de", 40, 316, 12.4, COLORS["BODY_MUTED"])
    text_top(c, "entregar reportes: clara, actualizable y", 40, 333, 12.4, COLORS["BODY_MUTED"])
    text_top(c, "validada por el cliente.", 40, 350, 12.4, COLORS["BODY_MUTED"])
    text_top(c, "Nueva entrega del reporte", 55, 597, 13.5, COLORS["ACCENT_CYAN"], "Helvetica-Bold")
    text_top(c, "El paciente accede, entiende, consulta y mantiene vivo", 55, 626, 9.2, COLORS["BODY_MUTED"])
    text_top(c, "su reporte dentro de Pocket Genes.", 55, 640, 9.2, COLORS["BODY_MUTED"])
    footer(c, "01")


def page2(c: canvas.Canvas, assets: dict[str, Path]) -> None:
    bg(c, assets)
    underline_pair(c)
    for x in [40, 184, 328]:
        rounded_card(c, x, 255, 112, 72, "CARD_FILL", "CARD_STROKE", 0.88, 16)
    rounded_card(c, 40, 375, 400, 78, "CARD_FILL", "CARD_STROKE_LIGHT", 0.92)
    rounded_card(c, 40, 475, 400, 78, "CARD_FILL", "CARD_STROKE_LIGHT", 0.92)
    rounded_card(c, 40, 575, 400, 88, "CARD_PURPLE_FILL", "#6B42B8", 0.94)
    footer(c, "02")
    text_top(c, "QUIÉNES SOMOS", 40, 61.44, 8, COLORS["ACCENT_CYAN"], "Helvetica-Bold")
    text_top(c, "Golden Crow VS", 40, 94.83, 31, COLORS["WHITE_MAIN"], "Helvetica-Bold")
    text_top(c, "Empresa de ingeniería mobile nativa para productos iOS y Android", 40, 159.06, 12.5, COLORS["BODY_MUTED"])
    text_top(c, "core de negocio.", 40, 176.06, 12.5, COLORS["BODY_MUTED"])
    text_center(c, "10+", 96, 264.46, 22, COLORS["ACCENT_CYAN"], "Helvetica-Bold")
    text_center(c, "20+", 240, 264.46, 22, COLORS["ACCENT_CYAN"], "Helvetica-Bold")
    text_center(c, "60-90", 384, 264.46, 22, COLORS["ACCENT_PINK"], "Helvetica-Bold")
    text_center(c, "años de experiencia", 96, 296.5, 8.5, COLORS["BODY_MUTED"])
    text_center(c, "proyectos realizados", 240, 296.5, 8.5, COLORS["BODY_MUTED"])
    text_center(c, "días al lanzamiento", 384, 296.5, 8.5, COLORS["BODY_MUTED"])
    text_top(c, "Qué aporta al piloto", 55, 390.16, 12, COLORS["ACCENT_PINK"], "Helvetica-Bold")
    text_top(c, "Producto mobile, UX, arquitectura, prototipo navegable, estructura de datos y soporte", 55, 416.31, 9.2, COLORS["BODY_MUTED"])
    text_top(c, "técnico para validar una primera integración.", 55, 428.45, 9.2, COLORS["BODY_MUTED"])
    text_top(c, "Cómo trabajamos", 55, 490.16, 12, COLORS["ACCENT_CYAN"], "Helvetica-Bold")
    text_top(c, "Scope claro, pantallas de alta fidelidad, demos iterativas, validación con el cliente y foco", 55, 516.31, 9.2, COLORS["BODY_MUTED"])
    text_top(c, "en decisiones que escalan.", 55, 528.45, 9.2, COLORS["BODY_MUTED"])
    text_top(c, "Enfoque", 55, 590.16, 12, COLORS["ACCENT_PURPLE"], "Helvetica-Bold")
    text_top(c, "Utilizamos las últimas tecnologías y herramientas de IA disponibles en el mercado, sin olvidar que", 55, 613.97, 8.4, COLORS["BODY_MUTED"])
    text_top(c, "el criterio de producto y la calidad humana de nuestro equipo deber ser la guía en nuestras", 55, 624.77, 8.4, COLORS["BODY_MUTED"])
    text_top(c, "decisiones del día a día", 55, 635.57, 8.4, COLORS["BODY_MUTED"])


def page3(c: canvas.Canvas, assets: dict[str, Path], screenshots: dict[str, Path]) -> None:
    bg(c, assets)
    underline_pair(c)
    image_box(c, assets["PHONE_EXPLORE_RED_P3"], 318, 110, 102, 190)
    for x, y, fill, stroke in [
        (40, 318, "CARD_FILL", "CARD_STROKE_LIGHT"),
        (270, 318, "CARD_PURPLE_FILL", "#6B42B8"),
        (40, 418, "CARD_PURPLE_FILL", "#6B42B8"),
        (270, 418, "CARD_FILL", "CARD_STROKE_LIGHT"),
    ]:
        rounded_card(c, x, y, 190, 82, fill, stroke, 0.92)
    thumbs = [
        ("APP_PATHOLOGY_CARDIO", 80, "Patología"),
        ("APP_ANCESTRY", 148, "Ascendencia"),
        ("APP_FILTER_PATHOGENICITY", 216, "Filtros"),
        ("APP_PATHOLOGY_NEUROLOGY", 284, "Neurología"),
        ("APP_INSIGHT_MCM6", 352, "Insight"),
    ]
    for name, x, label in thumbs:
        image_contain(c, screenshots[name], x, 539.52, 48, 104.46)
        text_center(c, label, x + 24, 658.47, 7, COLORS["CAPTION_MUTED"])
    footer(c, "03", COLORS["WHITE_MAIN"])
    text_top(c, "LA PLATAFORMA", 40, 47.44, 8, COLORS["ACCENT_PINK"], "Helvetica-Bold")
    text_top(c, "Pocket Genes", 40, 101.83, 31, COLORS["WHITE_MAIN"], "Helvetica-Bold")
    text_top(c, "Organiza información genética, explica", 40, 160.56, 12.5, COLORS["BODY_MUTED"])
    text_top(c, "conceptos y prepara conversaciones", 40, 178.56, 12.5, COLORS["BODY_MUTED"])
    text_top(c, "médicas en una experiencia mobile.", 40, 196.56, 12.5, COLORS["BODY_MUTED"])
    text_top(c, "Para proveedores, permite entregar reportes", 40, 232.56, 12.5, COLORS["BODY_MUTED"])
    text_top(c, "como experiencia interactiva: secciones", 40, 250.56, 12.5, COLORS["BODY_MUTED"])
    text_top(c, "navegables, glosario, acceso simple y", 40, 268.56, 12.5, COLORS["BODY_MUTED"])
    text_top(c, "continuidad del reporte.", 40, 286.56, 12.5, COLORS["BODY_MUTED"])
    text_top(c, "Reporte interactivo", 55, 335.23, 11, COLORS["ACCENT_CYAN"], "Helvetica-Bold")
    text_top(c, "Resumen, panel, genes, variantes y", 55, 361.54, 8.8, COLORS["BODY_MUTED"])
    text_top(c, "estado del reporte.", 55, 373.54, 8.8, COLORS["BODY_MUTED"])
    text_top(c, "Educación genética", 285, 335.23, 11, COLORS["ACCENT_PINK"], "Helvetica-Bold")
    text_top(c, "Glosario, contexto educativo y preguntas", 285, 361.54, 8.8, COLORS["BODY_MUTED"])
    text_top(c, "para consulta.", 285, 373.54, 8.8, COLORS["BODY_MUTED"])
    text_top(c, "Acceso simple", 55, 435.23, 11, COLORS["ACCENT_PURPLE"], "Helvetica-Bold")
    text_top(c, "Código de 6 caracteres; QR como flujo", 55, 461.54, 8.8, COLORS["BODY_MUTED"])
    text_top(c, "próximo.", 55, 473.54, 8.8, COLORS["BODY_MUTED"])
    text_top(c, "Panel vivo", 285, 435.23, 11, COLORS["ACCENT_GREEN"], "Helvetica-Bold")
    text_top(c, "Secciones actualizables, avisos y", 285, 461.54, 8.8, COLORS["BODY_MUTED"])
    text_top(c, "nuevas capas de contenido.", 285, 473.54, 8.8, COLORS["BODY_MUTED"])


def page4(c: canvas.Canvas, assets: dict[str, Path]) -> None:
    bg(c, assets)
    underline_pair(c)
    rounded_card(c, 40, 210, 190, 205, "CARD_FILL", "CARD_STROKE_LIGHT", 0.92)
    rounded_card(c, 270, 210, 190, 205, "CARD_PURPLE_FILL", "#6B42B8", 0.94)
    rounded_card(c, 40, 455, 400, 86, "CARD_FILL", "CARD_STROKE_LIGHT", 0.92)
    rounded_card(c, 40, 564, 400, 86, "CARD_PURPLE_FILL", "#6B42B8", 0.94)
    footer(c, "04")
    text_top(c, "NUEVA FORMA DE ENTREGA", 40, 61.44, 8, COLORS["ACCENT_CYAN"], "Helvetica-Bold")
    text_top(c, "Entrega co-diseñada", 40, 98.04, 28, COLORS["WHITE_MAIN"], "Helvetica-Bold")
    text_top(c, "El cliente define la estructura científica. Nosotros desarrollamos el", 40, 159.08, 12.3, COLORS["BODY_MUTED"])
    text_top(c, "recorrido mobile.", 40, 176.08, 12.3, COLORS["BODY_MUTED"])
    text_top(c, "El cliente define", 55, 222.12, 12.5, COLORS["ACCENT_CYAN"], "Helvetica-Bold")
    for text, y in [
        ("Secciones del reporte.", 251.61),
        ("Jerarquía: resumen, panel, genes y", 282.61),
        ("variantes.", 292.28),
        ("Lenguaje científico permitido.", 313.61),
        ("Advertencias y criterios de validación.", 344.61),
        ("Datos aprobados para la muestra.", 375.61),
    ]:
        if y != 292.28:
            dot(c, 60, y + 5.0, COLORS["ACCENT_CYAN"], 2.2)
        text_top(c, text, 71, y, 8.2, COLORS["BODY_MUTED"])
    text_top(c, "Nosotros desarrollamos", 285, 222.16, 12, COLORS["ACCENT_PINK"], "Helvetica-Bold")
    for text, y in [
        ("Navegación mobile.", 251.11),
        ("Componentes visuales y", 282.11),
        ("estados.", 291.78),
        ("Acceso por código; QR futuro.", 313.11),
        ("Prototipo y ajustes UX.", 344.11),
        ("Feedback y reporte de cierre.", 375.11),
    ]:
        if y != 291.78:
            dot(c, 290, y + 5.0, COLORS["ACCENT_PINK"], 2.2)
        text_top(c, text, 301, y, 8.2, COLORS["BODY_MUTED"])
    text_top(c, "Panel vivo", 55, 473.16, 12, COLORS["ACCENT_CYAN"], "Helvetica-Bold")
    text_top(c, "A diferencia de un PDF congelado, el bloque mobile puede evolucionar: nuevas secciones,", 55, 499.33, 9, COLORS["BODY_MUTED"])
    text_top(c, "avisos, correcciones y futuras notificaciones.", 55, 511.21, 9, COLORS["BODY_MUTED"])
    text_top(c, "Sección comunidad", 55, 582.16, 12, COLORS["ACCENT_PURPLE"], "Helvetica-Bold")
    text_top(c, "El usuario puede preguntar, publicar dudas, recibir contexto y conectar con recorridos", 55, 608.33, 9, COLORS["BODY_MUTED"])
    text_top(c, "similares, siempre con participación opt-in.", 55, 620.21, 9, COLORS["BODY_MUTED"])


def page5(c: canvas.Canvas, assets: dict[str, Path]) -> None:
    bg(c, assets)
    underline_pair(c)
    rounded_card(c, 40, 220, 190, 220, "CARD_FILL", "CARD_STROKE_LIGHT", 0.92)
    rounded_card(c, 270, 220, 190, 190, "CARD_PURPLE_FILL", "#6B42B8", 0.94)
    rounded_card(c, 40, 460, 400, 170, "CARD_FILL", "CARD_STROKE_LIGHT", 0.92)
    footer(c, "05")
    text_top(c, "PROPUESTA CONCRETA", 40, 61.44, 8, COLORS["ACCENT_PINK"], "Helvetica-Bold")
    text_top(c, "Piloto gratuito", 40, 94.83, 31, COLORS["WHITE_MAIN"], "Helvetica-Bold")
    text_top(c, "Tomar 1-2 reportes o paneles y convertirlos en un bloque mobile", 40, 159.08, 12.3, COLORS["BODY_MUTED"])
    text_top(c, "navegable, validado con el cliente.", 40, 176.08, 12.3, COLORS["BODY_MUTED"])
    text_top(c, "Incluye", 55, 238.02, 14, COLORS["ACCENT_CYAN"], "Helvetica-Bold")
    for text, y in [
        ("Workshop de co-diseño.", 268.92),
        ("Mapeo de secciones.", 295.92),
        ("Prototipo navegable.", 322.92),
        ("Integración productiva piloto.", 349.92),
        ("Glosario y preguntas.", 376.92),
        ("Feedback report.", 403.92),
    ]:
        dot(c, 60, y + 4.5, COLORS["ACCENT_CYAN"], 2.2)
        text_top(c, text, 71, y, 8.6, COLORS["BODY_MUTED"])
    text_top(c, "No incluye", 285, 238.02, 14, COLORS["ACCENT_PINK"], "Helvetica-Bold")
    for text, y in [
        ("API dedicada completa.", 268.92),
        ("Automatización clínica sin", 302.92),
        ("validar.", 313.06),
        ("App dedicada con marca", 336.92),
        ("propia.", 347.06),
        ("Soporte clínico al usuario final.", 370.92),
    ]:
        if y not in (313.06, 347.06):
            dot(c, 290, y + 4.5, COLORS["ACCENT_PINK"], 2.2)
        text_top(c, text, 301, y, 8.6, COLORS["BODY_MUTED"])
    text_top(c, "Timeline: 2 meses", 56, 478.09, 13, COLORS["WHITE_MAIN"], "Helvetica-Bold")
    c.saveState()
    c.setStrokeColor(HexColor(COLORS["TIMELINE_LINE"]))
    c.setStrokeAlpha(0.8)
    c.setLineWidth(1)
    c.line(86, PAGE_H - 535, 394, PAGE_H - 535)
    c.restoreState()
    for cx, color in [(86, COLORS["ACCENT_CYAN"]), (188, COLORS["ACCENT_PINK"]), (290, COLORS["ACCENT_PURPLE"]), (392, COLORS["ACCENT_GREEN"])]:
        dot(c, cx, 535, color, 5.2)
    for cx, head, line1, line2 in [
        (86, "Días 1-10", "Kickoff", "y selección"),
        (188, "Días 11-25", "Mapeo", "y co-diseño"),
        (290, "Días 26-45", "Prototipo", "y validación"),
        (392, "Días 46-60", "Ajustes", "y cierre"),
    ]:
        text_center(c, head, cx, 556.91, 8.5, COLORS["WHITE_MAIN"], "Helvetica-Bold")
        text_center(c, line1, cx, 577.18, 8.2, COLORS["BODY_MUTED"])
        text_center(c, line2, cx, 589.18, 8.2, COLORS["BODY_MUTED"])


def page6(c: canvas.Canvas, assets: dict[str, Path]) -> None:
    bg(c, assets)
    underline_pair(c)
    image_box(c, assets["PHONE_PATHOLOGY_P6"], 332, 62, 83, 190)
    rounded_card(c, 40, 260, 190, 185, "CARD_FILL", "CARD_STROKE_LIGHT", 0.94)
    rounded_card(c, 40, 462, 190, 78, "CARD_FILL", "CARD_STROKE_LIGHT", 0.92)
    rounded_card(c, 248, 462, 192, 78, "CARD_PURPLE_FILL", "#6B42B8", 0.94)
    rounded_card(c, 40, 558, 190, 78, "CARD_PURPLE_FILL", "#6B42B8", 0.94)
    rounded_card(c, 248, 558, 192, 78, "CARD_FILL", "CARD_STROKE_LIGHT", 0.92)
    text_top(c, "CIERRE", 40, 59.18, 8, COLORS["ACCENT_CYAN_P6"], "Helvetica-Bold")
    text_top(c, "Cómo arrancar", 40, 94.83, 31, COLORS["WHITE_PAGE6"], "Helvetica-Bold")
    text_top(c, "Un piloto chico y validado puede ser", 40, 170.31, 12.5, COLORS["WHITE_PAGE6"])
    text_top(c, "la puerta de entrada a un gran", 40, 187.31, 12.5, COLORS["WHITE_PAGE6"])
    text_top(c, "desarrollo conjunto.", 40, 204.31, 12.5, COLORS["WHITE_PAGE6"])
    text_top(c, "Primeros pasos", 54, 277.36, 16, COLORS["ACCENT_CYAN_P6"], "Helvetica-Bold")
    for text, y in [
        ("Elegir 1-2 reportes.", 313.78),
        ("Designar responsables.", 338.78),
        ("Compartir muestras.", 363.78),
        ("Validar alcance.", 388.78),
        ("Agendar kickoff.", 413.78),
    ]:
        dot(c, 60, y + 6.2, COLORS["ACCENT_CYAN_P6"], 2.8)
        text_top(c, text, 74, y, 10.9, COLORS["BODY_PAGE6"])
    text_top(c, "Autoridad científica", 56, 478.52, 12, COLORS["ACCENT_CYAN_P6"], "Helvetica-Bold")
    text_top(c, "El cliente define información y validación.", 56, 506.35, 9, COLORS["BODY_PAGE6"])
    text_top(c, "Experiencia mobile", 264, 478.52, 12, COLORS["ACCENT_PINK_P6"], "Helvetica-Bold")
    text_top(c, "Nosotros desarrollamos recorrido y", 264, 506.35, 9, COLORS["BODY_PAGE6"])
    text_top(c, "prototipo.", 264, 520.35, 9, COLORS["BODY_PAGE6"])
    text_top(c, "Comunidad opt-in", 56, 574.52, 12, COLORS["ACCENT_PURPLE_P6"], "Helvetica-Bold")
    text_top(c, "Sección comunidad suma contexto y", 56, 602.35, 9, COLORS["BODY_PAGE6"])
    text_top(c, "conexión.", 56, 616.35, 9, COLORS["BODY_PAGE6"])
    text_top(c, "Datos controlados", 264, 574.52, 12, COLORS["ACCENT_GREEN_P6"], "Helvetica-Bold")
    text_top(c, "La muestra puede usar datos", 264, 602.35, 9, COLORS["BODY_PAGE6"])
    text_top(c, "anonimizados.", 264, 616.35, 9, COLORS["BODY_PAGE6"])
    text_top(c, "Fuentes públicas: goldencrowvs.com, /pocket-genes, /integration, /community. Material comercial.", 40, 665.93, 7, COLORS["BODY_PAGE6"])
    footer(c, "06", COLORS["FOOTER_MUTED"], 689.93, 450)


def build_pdf(output: Path, manual_text: str, screenshots: dict[str, Path], tmp_dir: Path) -> None:
    # The manual is intentionally loaded and validated before this point. The
    # constants below encode its locked coordinate tables and copy deck.
    if "FINAL REDUNDANT LOCK SUMMARY" not in manual_text:
        raise SystemExit("Manual appears truncated; missing final lock summary.")
    assets = prepare_assets(screenshots, tmp_dir)
    output.parent.mkdir(parents=True, exist_ok=True)
    pdf = canvas.Canvas(str(output), pagesize=(PAGE_W, PAGE_H))
    page1(pdf, assets)
    pdf.showPage()
    page2(pdf, assets)
    pdf.showPage()
    page3(pdf, assets, screenshots)
    pdf.showPage()
    page4(pdf, assets)
    pdf.showPage()
    page5(pdf, assets)
    pdf.showPage()
    page6(pdf, assets)
    pdf.showPage()
    pdf.save()


def structural_check(output: Path) -> None:
    try:
        from pypdf import PdfReader
    except ImportError:
        print("Skipped structural PDF check: pypdf is not installed.", file=sys.stderr)
        return

    reader = PdfReader(str(output))
    if len(reader.pages) != 6:
        raise SystemExit(f"Expected 6 pages, found {len(reader.pages)}")
    fonts: set[str] = set()
    for index, page in enumerate(reader.pages, 1):
        width = float(page.mediabox.width)
        height = float(page.mediabox.height)
        if (width, height) != (PAGE_W, PAGE_H):
            raise SystemExit(f"Page {index} has size {width} x {height}; expected {PAGE_W} x {PAGE_H}")
        for font in (page.get("/Resources") or {}).get("/Font", {}).values():
            fonts.add(str(font.get_object().get("/BaseFont")))
    allowed = {"/Helvetica", "/Helvetica-Bold"}
    if fonts - allowed:
        raise SystemExit(f"Unexpected fonts found: {sorted(fonts - allowed)}")
    print(f"Verified PDF: 6 pages, {PAGE_W:.0f} x {PAGE_H:.0f} pt, fonts {sorted(fonts)}")


def render_check(output: Path, tmp_dir: Path) -> None:
    pdftoppm = shutil.which("pdftoppm")
    if not pdftoppm:
        print("Skipped render check: pdftoppm is not on PATH.", file=sys.stderr)
        return
    render_dir = tmp_dir / "render"
    render_dir.mkdir(parents=True, exist_ok=True)
    prefix = render_dir / "page"
    import subprocess

    subprocess.run([pdftoppm, "-r", "200", "-png", str(output), str(prefix)], check=True)
    pages = sorted(render_dir.glob("page-*.png"))
    print(f"Rendered {len(pages)} pages at 200 DPI into {render_dir}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Regenerate the Pocket Genes Integraciones brochure PDF.")
    parser.add_argument("--manual", type=Path, default=None, help="Path to the standalone recreation manual TXT.")
    parser.add_argument("--screenshots-dir", type=Path, default=DEFAULT_SCREENSHOTS_DIR, help="Directory containing the simulator screenshots.")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT, help="Output PDF path.")
    parser.add_argument("--tmp-dir", type=Path, default=DEFAULT_TMP_DIR, help="Directory for generated intermediate assets.")
    parser.add_argument("--render-check", action="store_true", help="Render pages at 200 DPI with pdftoppm when available.")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    manual_path = resolve_manual(args.manual)
    manual_text = load_manual(manual_path)
    screenshots = find_screenshots(args.screenshots_dir)
    output = args.output.expanduser().resolve()
    tmp_dir = args.tmp_dir.expanduser().resolve()
    build_pdf(output, manual_text, screenshots, tmp_dir)
    structural_check(output)
    if args.render_check:
        render_check(output, tmp_dir)
    print(f"Wrote {output}")


if __name__ == "__main__":
    main()
