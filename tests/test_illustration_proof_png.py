import struct
import sys
import tempfile
import unittest
import zlib
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scripts.validate_illustration_style_proof import parse_png


def png_chunk(chunk_type: bytes, payload: bytes) -> bytes:
    return struct.pack(">I", len(payload)) + chunk_type + payload + struct.pack(">I", zlib.crc32(chunk_type + payload) & 0xFFFFFFFF)


def rgba_png(width: int, height: int, alpha: int) -> bytes:
    pixel = bytes((32, 64, 96, alpha))
    rows = b"".join(b"\x00" + pixel * width for _ in range(height))
    header = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + png_chunk(b"IHDR", header) + png_chunk(b"IDAT", zlib.compress(rows, 9)) + png_chunk(b"IEND", b"")


class ProofPngValidationTests(unittest.TestCase):
    def inspect(self, payload: bytes):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "proof.png"
            path.write_bytes(payload)
            return parse_png(path)

    def test_valid_transparent_rgba_640_by_800_passes(self):
        errors, metadata = self.inspect(rgba_png(640, 800, 0))
        self.assertEqual(errors, [])
        self.assertEqual((metadata["width"], metadata["height"]), (640, 800))
        self.assertTrue(metadata["rgba"])
        self.assertTrue(metadata["decoded"])
        self.assertTrue(metadata["meaningfulTransparency"])

    def test_wrong_dimensions_fail(self):
        errors, _ = self.inspect(rgba_png(320, 400, 0))
        self.assertTrue(any("dimensions" in error for error in errors))

    def test_opaque_rgba_fails_meaningful_transparency(self):
        errors, metadata = self.inspect(rgba_png(640, 800, 255))
        self.assertFalse(metadata["meaningfulTransparency"])
        self.assertTrue(any("opaque rectangular background" in error for error in errors))

    def test_corrupt_png_fails_integrity_or_decode(self):
        payload = bytearray(rgba_png(640, 800, 0))
        payload[-20] ^= 0xFF
        errors, _ = self.inspect(bytes(payload))
        self.assertTrue(any("CRC" in error or "decoding failed" in error for error in errors))

    def test_wrong_file_signature_fails(self):
        errors, _ = self.inspect(b"not a png")
        self.assertIn("invalid PNG signature", errors)


if __name__ == "__main__":
    unittest.main()
