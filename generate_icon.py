#!/usr/bin/env python3
"""Generate the extension icon PNGs without third-party dependencies."""

from pathlib import Path
import struct
import zlib


VIEWBOX_SIZE = 128
SAMPLE_GRID = 4
ICON_SIZES = (16, 32, 48, 128)


def mix(start, end, amount):
    return tuple(round(a + (b - a) * amount) for a, b in zip(start, end))


def gradient_color(point, start, end, first_color, second_color):
    x, y = point
    start_x, start_y = start
    end_x, end_y = end
    axis_x = end_x - start_x
    axis_y = end_y - start_y
    axis_length_squared = axis_x * axis_x + axis_y * axis_y
    amount = ((x - start_x) * axis_x + (y - start_y) * axis_y) / axis_length_squared
    return mix(first_color, second_color, max(0.0, min(1.0, amount)))


def inside_rounded_rect(x, y, left, top, right, bottom, radius):
    if x < left or x > right or y < top or y > bottom:
        return False
    if left + radius <= x <= right - radius or top + radius <= y <= bottom - radius:
        return True

    center_x = left + radius if x < left + radius else right - radius
    center_y = top + radius if y < top + radius else bottom - radius
    return (x - center_x) ** 2 + (y - center_y) ** 2 <= radius ** 2


def distance_to_segment_squared(x, y, start_x, start_y, end_x, end_y):
    segment_x = end_x - start_x
    segment_y = end_y - start_y
    length_squared = segment_x * segment_x + segment_y * segment_y
    amount = ((x - start_x) * segment_x + (y - start_y) * segment_y) / length_squared
    amount = max(0.0, min(1.0, amount))
    nearest_x = start_x + amount * segment_x
    nearest_y = start_y + amount * segment_y
    return (x - nearest_x) ** 2 + (y - nearest_y) ** 2


def inside_stroke(x, y, segments, width=10):
    radius_squared = (width / 2) ** 2
    return any(
        distance_to_segment_squared(x, y, *segment) <= radius_squared
        for segment in segments
    )


def sample_color(x, y):
    background_visible = inside_rounded_rect(x, y, 6, 6, 122, 122, 29)
    if not background_visible:
        return None

    white_segments = ((36, 22, 36, 92), (36, 92, 106, 92))
    accent_segments = ((22, 36, 92, 36), (92, 36, 92, 106))

    if inside_stroke(x, y, accent_segments):
        return gradient_color(
            (x, y),
            (25, 34),
            (99, 103),
            (174, 179, 255),
            (116, 110, 255),
        )
    if inside_stroke(x, y, white_segments):
        return (255, 255, 255)
    return gradient_color(
        (x, y),
        (22, 12),
        (106, 116),
        (34, 44, 67),
        (17, 24, 39),
    )


def png_chunk(chunk_type, data):
    return (
        struct.pack(">I", len(data))
        + chunk_type
        + data
        + struct.pack(">I", zlib.crc32(chunk_type + data) & 0xFFFFFFFF)
    )


def render_icon(size):
    rows = []
    sample_count = SAMPLE_GRID * SAMPLE_GRID
    scale = VIEWBOX_SIZE / size

    for pixel_y in range(size):
        row = bytearray([0])
        for pixel_x in range(size):
            visible_colors = []
            for sample_y in range(SAMPLE_GRID):
                for sample_x in range(SAMPLE_GRID):
                    x = (pixel_x + (sample_x + 0.5) / SAMPLE_GRID) * scale
                    y = (pixel_y + (sample_y + 0.5) / SAMPLE_GRID) * scale
                    color = sample_color(x, y)
                    if color is not None:
                        visible_colors.append(color)

            if not visible_colors:
                row.extend((0, 0, 0, 0))
                continue

            red = round(sum(color[0] for color in visible_colors) / len(visible_colors))
            green = round(sum(color[1] for color in visible_colors) / len(visible_colors))
            blue = round(sum(color[2] for color in visible_colors) / len(visible_colors))
            alpha = round(255 * len(visible_colors) / sample_count)
            row.extend((red, green, blue, alpha))
        rows.append(bytes(row))

    raw_pixels = b"".join(rows)
    header = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    return (
        b"\x89PNG\r\n\x1a\n"
        + png_chunk(b"IHDR", header)
        + png_chunk(b"IDAT", zlib.compress(raw_pixels, 9))
        + png_chunk(b"IEND", b"")
    )


def main():
    output_directory = Path(__file__).resolve().parent
    for size in ICON_SIZES:
        icon_data = render_icon(size)
        (output_directory / f"icon-{size}.png").write_bytes(icon_data)
        if size == 128:
            (output_directory / "icon.png").write_bytes(icon_data)


if __name__ == "__main__":
    main()
