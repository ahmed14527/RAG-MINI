import tempfile
from pathlib import Path

from django.test import SimpleTestCase

from rag.errors import IngestionError
from rag.helpers.text_processing import (
    TextSection, chunk_sections, chunk_text, extract_sections, file_type_for, split_markdown,
)

from .utils import make_pdf


class ChunkTextTests(SimpleTestCase):
    def test_windows_overlap_and_cover_all_words(self):
        words = [f"w{i}" for i in range(25)]
        chunks = chunk_text(" ".join(words), chunk_size=10, overlap=3)

        self.assertEqual(chunks[0].split(), words[:10])
        self.assertEqual(chunks[1].split()[:3], words[7:10])  # overlap
        self.assertEqual(chunks[-1].split()[-1], "w24")
        self.assertEqual(len(chunks), 4)  # starts at 0, 7, 14, 21

    def test_no_redundant_tail_chunk(self):
        self.assertEqual(len(chunk_text(" ".join(["x"] * 10), chunk_size=10, overlap=3)), 1)

    def test_empty_text(self):
        self.assertEqual(chunk_text("   \n "), [])

    def test_is_deterministic(self):
        text = " ".join(f"w{i}" for i in range(1000))
        self.assertEqual(chunk_text(text, 300, 50), chunk_text(text, 300, 50))

    def test_chunks_never_span_sections_and_keep_location(self):
        sections = [TextSection("a " * 15, page=1), TextSection("b " * 5, page=2, section="Intro")]
        chunks = chunk_sections(sections, chunk_size=10, overlap=0)

        self.assertEqual([c.page for c in chunks], [1, 1, 2])
        self.assertEqual([c.index for c in chunks], [0, 1, 2])
        self.assertEqual(chunks[2].section, "Intro")
        self.assertNotIn("b", chunks[1].text)


class ExtractionTests(SimpleTestCase):
    def write(self, name: str, data: bytes) -> Path:
        path = Path(tempfile.mkdtemp()) / name
        path.write_bytes(data)
        return path

    def test_pdf_pages_are_numbered(self):
        path = self.write("a.pdf", make_pdf(["First page", "", "Third page"]))
        sections = extract_sections(path, "pdf")

        self.assertEqual([(s.page, s.text.strip()) for s in sections], [(1, "First page"), (3, "Third page")])

    def test_corrupt_pdf_raises_user_facing_error(self):
        path = self.write("bad.pdf", b"%PDF-1.4 garbage")
        with self.assertRaises(IngestionError):
            extract_sections(path, "pdf")

    def test_markdown_sections_follow_headings(self):
        sections = split_markdown("Preamble\n# Setup\nInstall it.\n```\n# not a heading\n```\n## Usage\nRun it.")

        self.assertEqual([s.section for s in sections], [None, "Setup", "Usage"])
        self.assertIn("# not a heading", sections[1].text)

    def test_binary_text_file_rejected(self):
        path = self.write("x.txt", b"abc\x00\x01")
        with self.assertRaises(IngestionError):
            extract_sections(path, "txt")

    def test_supported_types(self):
        self.assertEqual(file_type_for("A.PDF"), "pdf")
        self.assertEqual(file_type_for("notes.markdown"), "md")
        self.assertIsNone(file_type_for("sheet.xlsx"))
