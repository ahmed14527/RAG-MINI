"""
Text extraction and chunking.

Extraction yields `TextSection`s that keep their location (PDF page number or
Markdown heading) so every chunk can be cited precisely.
"""

import logging
import re
from dataclasses import dataclass
from pathlib import Path

from pypdf import PdfReader

from ..errors import IngestionError

logger = logging.getLogger(__name__)

# File extension -> file type stored on the Document.
SUPPORTED_FILE_TYPES = {
    '.pdf': 'pdf',
    '.txt': 'txt',
    '.md': 'md',
    '.markdown': 'md',
}

_MD_HEADING = re.compile(r'^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$')


@dataclass
class TextSection:
    text: str
    page: int | None = None
    section: str | None = None


@dataclass
class Chunk:
    text: str
    index: int
    page: int | None = None
    section: str | None = None


def file_type_for(filename: str) -> str | None:
    return SUPPORTED_FILE_TYPES.get(Path(filename).suffix.lower())


def clean_text(text: str) -> str:
    """Normalize extracted text: re-join hyphenated line breaks, drop NULs."""
    text = text.replace('\x00', '')
    return re.sub(r'(\w)-\n(\w)', r'\1\2', text)


def extract_text_from_pdf(file_path) -> list[TextSection]:
    """Extract one section per non-empty PDF page (pages are 1-based)."""
    try:
        reader = PdfReader(file_path)
        if reader.is_encrypted and not reader.decrypt(''):
            raise IngestionError("This PDF is password-protected. Remove the password and upload it again.")
        sections = []
        for number, page in enumerate(reader.pages, start=1):
            content = clean_text(page.extract_text() or '')
            if content.strip():
                sections.append(TextSection(content, page=number))
        return sections
    except IngestionError:
        raise
    except Exception as e:  # pypdf raises many exception types on malformed files
        logger.warning("Could not parse PDF %s: %s: %s", file_path, type(e).__name__, e)
        raise IngestionError("This PDF could not be read. It may be corrupted or use an unsupported format.")


def decode_text_file(data: bytes) -> str:
    if b'\x00' in data:
        raise IngestionError("This file looks like binary data, not text.")
    try:
        return data.decode('utf-8-sig')
    except UnicodeDecodeError:
        return data.decode('latin-1')


def split_markdown(text: str) -> list[TextSection]:
    """Split Markdown into sections, each tagged with its nearest heading."""
    sections, heading, lines = [], None, []

    def flush():
        body = '\n'.join(lines).strip()
        if body:
            sections.append(TextSection(body, section=heading))

    in_code_block = False
    for line in text.splitlines():
        if line.lstrip().startswith('```'):
            in_code_block = not in_code_block
        match = None if in_code_block else _MD_HEADING.match(line)
        if match:
            flush()
            heading, lines = match.group(1)[:200], [line]
        else:
            lines.append(line)
    flush()
    return sections


def extract_sections(file_path, file_type: str) -> list[TextSection]:
    """Extract located text sections from a stored file."""
    if file_type == 'pdf':
        return extract_text_from_pdf(file_path)

    text = clean_text(decode_text_file(Path(file_path).read_bytes()))
    if file_type == 'md':
        return split_markdown(text)
    return [TextSection(text)] if text.strip() else []


def chunk_text(text: str, chunk_size: int = 500, overlap: int = 0) -> list[str]:
    """
    Split text into windows of `chunk_size` words, consecutive windows
    sharing `overlap` words.
    """
    words = text.split()
    if not words:
        return []
    overlap = max(0, min(overlap, chunk_size // 2))
    step = chunk_size - overlap

    chunks = []
    for start in range(0, len(words), step):
        chunks.append(" ".join(words[start:start + chunk_size]))
        if start + chunk_size >= len(words):
            break
    return chunks


def chunk_sections(sections: list[TextSection], chunk_size: int, overlap: int) -> list[Chunk]:
    """Chunk each section separately so a chunk never spans two pages/sections."""
    chunks = []
    for section in sections:
        for text in chunk_text(section.text, chunk_size, overlap):
            chunks.append(Chunk(text=text, index=len(chunks), page=section.page, section=section.section))
    return chunks
