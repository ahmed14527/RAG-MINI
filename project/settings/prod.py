"""
Production settings for Django PDF RAG Chat project.
"""

from .base import *

# SECURITY WARNING: don't run with debug turned on in production!
DEBUG = False

ALLOWED_HOSTS = config('ALLOWED_HOSTS', default='').split(',')

# Add WhiteNoise to existing middleware for static files
MIDDLEWARE.insert(1, 'whitenoise.middleware.WhiteNoiseMiddleware')

# Production static files
STATIC_ROOT = BASE_DIR / 'staticfiles'

# Production media files
MEDIA_ROOT = config('MEDIA_ROOT', default=str(BASE_DIR / 'media'))