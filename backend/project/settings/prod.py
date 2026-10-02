"""
Production settings for Django PDF RAG Chat project.
"""

from django.core.exceptions import ImproperlyConfigured

from .base import *

# SECURITY WARNING: don't run with debug turned on in production!
DEBUG = False

# A random per-process key would invalidate every JWT on restart. Fall back to
# the key the Docker entrypoint generates in the data volume.
if not config('SECRET_KEY', default=''):
    _key_file = DATA_DIR / '.secret_key'
    if not _key_file.is_file():
        raise ImproperlyConfigured("SECRET_KEY must be set in production.")
    SECRET_KEY = _key_file.read_text().strip()

ALLOWED_HOSTS = config('ALLOWED_HOSTS', default='localhost,127.0.0.1', cast=Csv())

# Add WhiteNoise to existing middleware for static files
MIDDLEWARE.insert(1, 'whitenoise.middleware.WhiteNoiseMiddleware')

SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = 'DENY'
