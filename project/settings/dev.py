"""
Development settings for Django PDF RAG Chat project.
"""

from .base import *

# SECURITY WARNING: don't run with debug turned on in production!
DEBUG = True

ALLOWED_HOSTS = ['localhost', '127.0.0.1', '0.0.0.0']

# Development static files
STATIC_ROOT = BASE_DIR / 'staticfiles'