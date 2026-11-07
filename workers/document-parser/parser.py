"""Bounded, credential-free document extraction. One process owns one PDFium runtime.

This process produces private files and a manifest; it never writes business records,
fetches document links, or claims that an image object is a portfolio work. The caller
must provide an isolated working directory and enforce a wall-clock deadline.
"""
from __future__ import annotations

import argparse
import ctypes
from contextlib import closing
import hashlib
import importlib.metadata
import json
import math
import os
from pathlib import Path
import resource
import sys
import warnings

import pypdfium2 as pdfium
import pypdfium2.raw as pdfium_c
from PIL import Image, ImageOps

SCHEMA_VERSION = "once-document-pages-v1"
PARSER_VERSION = "1.0.0"
MAX_INPUT_BYTES = 50_000_000
MAX_IMAGE_BYTES = 30_000_000
MAX_IMAGE_PIXELS = 60_000_000
MAX_PAGES = 100
MAX_PAGE_TEXT = 20_000
MAX_TEXT_REGIONS = 500
MAX_PAGE_OBJECTS = 5_000
MAX_IMAGES = 500
MAX_OUTPUT_BYTES = 256_000_000
PAGE_LONG_EDGE = 2048
Image.MAX_IMAGE_PIXELS = MAX_IMAGE_PIXELS
warnings.simplefilter("error", Image.DecompressionBombWarning)


class Rejected(Exception):
    def __init__(self, code: str):
        self.code = code


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


class Output:
    def __init__(self, directory: Path):
        # Never take over an existing directory, including a symlink or stale run.
        directory.mkdir(mode=0o700, parents=False, exist_ok=False)
        self.directory = directory
        self.total_bytes = 0
        self.images = 0

    def image(self, image: Image.Image, name: str) -> dict:
        if not image.width or not image.height or image.width * image.height > MAX_IMAGE_PIXELS:
            raise Rejected("IMAGE_PIXELS_EXCEEDED")
        path = self.directory / name
        with path.open("xb") as stream:
            os.chmod(path, 0o600)
            # Page crops preserve their rendered appearance; PNG preserves alpha in
            # separately exported image objects. Neither path uses generative edits.
            image.save(stream, format="PNG", optimize=False)
        data = path.read_bytes()
        self.total_bytes += len(data)
        if self.total_bytes > MAX_OUTPUT_BYTES:
            raise Rejected("OUTPUT_LIMIT_EXCEEDED")
        return {"file": name, "sha256": sha256(data), "bytes": len(data),
                "width": image.width, "height": image.height, "mime": "image/png"}


def normalized_region(page, bitmap, bounds) -> list[float] | None:
    """PDFium applies the page crop box and rotation during the coordinate transform."""
    left, bottom, right, top = bounds
    points = []
    for x, y in [(left, bottom), (right, bottom), (left, top), (right, top)]:
        if not math.isfinite(x) or not math.isfinite(y):
            return None
        dx, dy = ctypes.c_int(), ctypes.c_int()
        if not pdfium_c.FPDF_PageToDevice(page, 0, 0, bitmap.width, bitmap.height,
                                         0, x, y, dx, dy):
            return None
        points.append((dx.value / bitmap.width, dy.value / bitmap.height))
    x0, y0 = (max(0.0, min(p[n] for p in points)) for n in (0, 1))
    x1, y1 = (min(1.0, max(p[n] for p in points)) for n in (0, 1))
    if x1 <= x0 or y1 <= y0:
        return None
    return [round(x0, 6), round(y0, 6), round(x1, 6), round(y1, 6)]


def crop_image(image: Image.Image, region: list[float]) -> Image.Image:
    x0, y0, x1, y1 = region
    return image.crop((math.floor(x0 * image.width), math.floor(y0 * image.height),
                       math.ceil(x1 * image.width), math.ceil(y1 * image.height)))


def pdf_page(document, index: int, out: Output) -> dict:
    number = index + 1
    with closing(document[index]) as page:
        width, height = page.get_size()
        if not all(math.isfinite(x) and 0 < x <= 100_000 for x in (width, height)):
            raise Rejected("PAGE_SIZE_INVALID")
        scale = PAGE_LONG_EDGE / max(width, height)
        with closing(page.render(scale=scale, may_draw_forms=False)) as bitmap:
            image = bitmap.to_pil().copy()
            notes: list[str] = []
            page_image = out.image(image, f"page-{number:04d}.png")
            regions, text = [], ""
            with closing(page.get_textpage()) as text_page:
                text = text_page.get_text_bounded()
                if len(text) > MAX_PAGE_TEXT:
                    text = text[:MAX_PAGE_TEXT]
                    notes.append("TEXT_TRUNCATED")
                rectangle_count = text_page.count_rects()
                if rectangle_count > MAX_TEXT_REGIONS:
                    notes.append("TEXT_REGIONS_TRUNCATED")
                for i in range(min(rectangle_count, MAX_TEXT_REGIONS)):
                    bounds = text_page.get_rect(i)
                    region = normalized_region(page, bitmap, bounds)
                    if region:
                        value = text_page.get_text_bounded(*bounds)
                        if value.strip():
                            regions.append({"key": f"p{number}_t{i + 1}", "bbox": region,
                                            "text": value[:2000]})
                            if len(value) > 2000:
                                notes.append("REGION_TEXT_TRUNCATED")
            images = []
            for ordinal, obj in enumerate(page.get_objects(max_depth=1)):
                if ordinal >= MAX_PAGE_OBJECTS:
                    notes.append("PAGE_OBJECTS_TRUNCATED")
                    break
                if obj.type == pdfium_c.FPDF_PAGEOBJ_FORM:
                    # Nested form transforms and clipping must be interpreted from
                    # the rendered page; do not invent a page bbox for child objects.
                    notes.append("NESTED_LAYOUT_REQUIRES_VISION")
                    continue
                if obj.type != pdfium_c.FPDF_PAGEOBJ_IMAGE:
                    continue
                if out.images >= MAX_IMAGES:
                    notes.append("IMAGE_CANDIDATES_TRUNCATED")
                    break
                region = normalized_region(page, bitmap, obj.get_bounds())
                if not region:
                    continue
                cropped = crop_image(image, region)
                if min(cropped.size) < 24:
                    cropped.close()
                    continue
                out.images += 1
                key = f"p{number}_i{out.images}"
                with cropped:
                    crop = out.image(cropped, key + "-crop.png")
                candidate = {"key": key, "page": number, "bbox": region,
                             "method": "PAGE_CROP", "image": crop, "nativeImage": None}
                try:
                    nw, nh = obj.get_px_size()
                    if 0 < nw * nh <= MAX_IMAGE_PIXELS:
                        with closing(obj.get_bitmap(render=True)) as native_bitmap:
                            native = native_bitmap.to_pil().copy()
                        with native:
                            candidate["nativeImage"] = out.image(native, key + "-object.png")
                    else:
                        notes.append("NATIVE_IMAGE_PIXELS_EXCEEDED")
                except Rejected:
                    raise
                except Exception:
                    # The page crop is the appearance reference. Native extraction
                    # failure must not discard an otherwise useful page.
                    notes.append("NATIVE_IMAGE_UNAVAILABLE")
                images.append(candidate)
            image.close()
            return {"page": number, "width": width, "height": height,
                    "rotation": page.get_rotation(), "image": page_image,
                    "text": text, "textRegions": regions, "images": images,
                    "needsVisualText": not text.strip(), "warnings": sorted(set(notes))}


def image_page(data: bytes, source: Path, out: Output) -> dict:
    if len(data) > MAX_IMAGE_BYTES:
        raise Rejected("FILE_SIZE_EXCEEDED")
    with Image.open(source) as raw:
        if raw.format not in ("JPEG", "PNG", "WEBP") or getattr(raw, "n_frames", 1) != 1:
            raise Rejected("IMAGE_FORMAT_UNSUPPORTED")
        if raw.width * raw.height > MAX_IMAGE_PIXELS:
            raise Rejected("IMAGE_PIXELS_EXCEEDED")
        original = ImageOps.exif_transpose(raw)
        with original:
            native = out.image(original, "image-0001.png")
            page = original.copy()
            page.thumbnail((PAGE_LONG_EDGE, PAGE_LONG_EDGE))
            with page:
                preview = out.image(page, "page-0001.png")
        return {"page": 1, "width": native["width"], "height": native["height"],
                "rotation": 0, "image": preview, "text": "", "textRegions": [],
                "images": [{"key": "p1_i1", "page": 1, "bbox": [0, 0, 1, 1],
                            "method": "UPLOADED_IMAGE", "image": preview, "nativeImage": native}],
                "needsVisualText": True, "warnings": []}


def extract(source: Path, destination: Path, selected: list[int] | None = None) -> dict:
    if source.is_symlink() or not source.is_file():
        raise Rejected("INPUT_FILE_INVALID")
    size = source.stat().st_size
    if not 0 < size <= MAX_INPUT_BYTES:
        raise Rejected("FILE_SIZE_EXCEEDED")
    data = source.read_bytes()
    if len(data) != size:
        raise Rejected("INPUT_CHANGED")
    is_pdf = data.startswith(b"%PDF-")
    out = Output(destination)
    pages, failed = [], []
    if is_pdf:
        try:
            document = pdfium.PdfDocument(data)
        except pdfium.PdfiumError as error:
            raise Rejected("PDF_PASSWORD_REQUIRED" if error.err_code == pdfium_c.FPDF_ERR_PASSWORD
                           else "PDF_INVALID") from None
        with document:
            count = len(document)
            requested = selected if selected is not None else list(range(1, min(count, MAX_PAGES + 1) + 1))
            if not requested or len(requested) > MAX_PAGES:
                raise Rejected("PAGE_LIMIT_EXCEEDED")
            if len(set(requested)) != len(requested) or any(n < 1 or n > count for n in requested):
                raise Rejected("PAGE_SELECTION_INVALID")
            for number in sorted(requested):
                try:
                    pages.append(pdf_page(document, number - 1, out))
                except Rejected:
                    raise
                except Exception:
                    failed.append({"page": number, "code": "PAGE_EXTRACTION_FAILED"})
    else:
        if selected not in (None, [1]):
            raise Rejected("PAGE_SELECTION_INVALID")
        count, requested = 1, [1]
        pages.append(image_page(data, source, out))
    if not pages:
        raise Rejected("NO_PAGES_EXTRACTED")
    incomplete = bool(failed or len(requested) < count or any(
        any("TRUNCATED" in note for note in p["warnings"]) for p in pages))
    result = {"schemaVersion": SCHEMA_VERSION, "parserVersion": PARSER_VERSION,
              "runtime": {"pypdfium2": importlib.metadata.version("pypdfium2"),
                          "pillow": importlib.metadata.version("Pillow")},
              "input": {"sha256": sha256(data), "bytes": size, "kind": "PDF" if is_pdf else "IMAGE"},
              "status": "PARTIAL" if incomplete else "READY", "totalPages": count,
              "requestedPages": sorted(requested), "pages": pages, "failedPages": failed,
              "outputBytes": out.total_bytes}
    with (destination / "manifest.json").open("x", encoding="utf-8") as stream:
        os.chmod(destination / "manifest.json", 0o600)
        json.dump(result, stream, ensure_ascii=False, allow_nan=False)
    return result


def main() -> int:
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--pages", default="")
    parser.add_argument("--inspect", action="store_true")
    args = parser.parse_args()
    # Native codecs are untrusted-input processors. A separate container supplies
    # network/filesystem isolation; these limits are not advertised as that sandbox.
    resource.setrlimit(resource.RLIMIT_AS, (768 * 1024 * 1024, 768 * 1024 * 1024))
    resource.setrlimit(resource.RLIMIT_CPU, (60, 60))
    resource.setrlimit(resource.RLIMIT_FSIZE, (MAX_OUTPUT_BYTES, MAX_OUTPUT_BYTES))
    os.umask(0o077)
    try:
        if args.inspect:
            source = Path(args.input)
            if source.is_symlink() or not source.is_file():
                raise Rejected("INPUT_FILE_INVALID")
            size = source.stat().st_size
            if not 0 < size <= MAX_INPUT_BYTES:
                raise Rejected("FILE_SIZE_EXCEEDED")
            data = source.read_bytes()
            if len(data) != size:
                raise Rejected("INPUT_CHANGED")
            if data.startswith(b"%PDF-"):
                try:
                    with pdfium.PdfDocument(data) as document:
                        count = len(document)
                except pdfium.PdfiumError as error:
                    raise Rejected("PDF_PASSWORD_REQUIRED" if error.err_code == pdfium_c.FPDF_ERR_PASSWORD
                                   else "PDF_INVALID") from None
            else:
                # Actual image format, size and pixels are checked by extraction.
                count = 1
            if not 0 < count <= MAX_PAGES:
                raise Rejected("PAGE_LIMIT_EXCEEDED")
            print(json.dumps({"totalPages": count, "sha256": sha256(data), "bytes": size}))
            return 0
        selected = None
        if args.pages:
            parts = args.pages.split(",")
            if len(parts) > MAX_PAGES or any(not p.isascii() or not p.isdigit() for p in parts):
                raise Rejected("PAGE_SELECTION_INVALID")
            selected = [int(p) for p in parts]
        result = extract(Path(args.input), Path(args.output), selected)
        print(json.dumps({"status": result["status"], "manifest": "manifest.json",
                          "processedPages": len(result["pages"]), "totalPages": result["totalPages"]}))
        return 0
    except Rejected as error:
        print(json.dumps({"error": error.code}))
    except Exception:
        # No filenames, PDF content, environment or native exception text in logs.
        print(json.dumps({"error": "DOCUMENT_EXTRACTION_FAILED"}))
    return 1


if __name__ == "__main__":
    sys.exit(main())
