import logging
import PyPDF2

logger = logging.getLogger(__name__)


def extract_text_from_pdf(file_path):
    """
    Extract text from a PDF file.

    Args:
        file_path (str): Path to the PDF file.
    
    Returns:
        str: Extracted text from the PDF.
    """
    text = []
    
    try:
        with open(file_path, 'rb') as pdf_file:
            reader = PyPDF2.PdfReader(pdf_file)
            
            for page in reader.pages:
                content = page.extract_text()
                if content:
                    text.append(content)
        
        return "\n".join(text)
        
    except Exception as e:
        logger.error(f"Error extracting text from PDF {file_path}: {str(e)}", exc_info=True)
        raise


def chunk_text(text, chunk_size=500):
    """
    Chunk text into smaller pieces. 
    
    Args:
        text (str): The text to chunk.
        chunk_size (int): The size of each chunk.
    
    Returns:
        list of str: List of text chunks.
    """
    words = text.split()
    chunks = []
    for i in range(0, len(words), chunk_size):
        chunks.append(" ".join(words[i:i + chunk_size])) 
    
    return chunks