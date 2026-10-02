"""
Development settings for Django PDF RAG Chat project.
"""

from .base import *

# SECURITY WARNING: don't run with debug turned on in production!
DEBUG = True

ALLOWED_HOSTS = ['localhost', '127.0.0.1', '0.0.0.0', 'testserver']

# A stable fallback so dev-server restarts don't invalidate every JWT.
# Never used in production (prod.py requires SECRET_KEY).
if not config('SECRET_KEY', default=''):
    SECRET_KEY = 'django-insecure-dev-only-key-do-not-use-in-production'
