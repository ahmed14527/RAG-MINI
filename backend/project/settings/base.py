"""
Base settings for Django PDF RAG Chat project.
Contains common settings shared across all environments.
"""

from pathlib import Path
from decouple import config, Csv
from datetime import timedelta
from django.core.management.utils import get_random_secret_key

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent.parent

# All runtime state (SQLite DB, uploads, vector index) lives under DATA_DIR,
# so a single Docker volume can persist it.
DATA_DIR = Path(config('DATA_DIR', default=str(BASE_DIR)))

# SECURITY WARNING: keep the secret key used in production secret!
SECRET_KEY = config('SECRET_KEY', default='') or get_random_secret_key()

# Application definition
INSTALLED_APPS = [
    "daphne",
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',

    'corsheaders',
    'channels',
    'rest_framework',
    'rest_framework_simplejwt',
    'account',
    'rag',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'project.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'project.wsgi.application'
ASGI_APPLICATION = 'project.asgi.application'

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ),
    'EXCEPTION_HANDLER': 'rag.errors.api_exception_handler',
    'DEFAULT_THROTTLE_RATES': {
        'chat': config('RAG_CHAT_RATE', default='30/min'),
        'upload': config('RAG_UPLOAD_RATE', default='60/hour'),
    },
}

# JWT Configuration - Token Lifetimes
SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(minutes=30),  # 30 minutes
    'REFRESH_TOKEN_LIFETIME': timedelta(days=7),     # 7 days
    "UPDATE_LAST_LOGIN": True,
}

# CORS - the frontend calls the API from another origin (e.g. :3000 -> :8000).
# Auth uses bearer tokens, not cookies, so credentials are not allowed.
CORS_ALLOWED_ORIGINS = config(
    'CORS_ALLOWED_ORIGINS', default='http://localhost:3000,http://127.0.0.1:3000', cast=Csv()
)

# Database
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': DATA_DIR / 'db.sqlite3',
    }
}

# Channels
CHANNEL_LAYERS = {
    "default": {
        "BACKEND": "channels.layers.InMemoryChannelLayer"
    }
}

# Password validation
AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',
    },
]

# Internationalization
LANGUAGE_CODE = 'en-us'
TIME_ZONE = "Africa/Cairo"
USE_I18N = True
USE_TZ = True

# Static files
STATIC_URL = 'static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'

# Media files (user uploaded content)
MEDIA_URL = 'media/'
MEDIA_ROOT = Path(config('MEDIA_ROOT', default=str(DATA_DIR / 'media')))

# Default primary key field type
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# --- LLM / embeddings (any OpenAI-compatible API) -----------------------------
OPENAI_API_KEY = config('OPENAI_API_KEY', default='')
OPENAI_BASE_URL = config('OPENAI_BASE_URL', default='') or None
LLM_MODEL = config('LLM_MODEL', default='gpt-4o-mini')
LLM_TEMPERATURE = config('LLM_TEMPERATURE', default=0.1, cast=float)
LLM_TIMEOUT_SECONDS = config('LLM_TIMEOUT_SECONDS', default=60, cast=float)
# Embeddings default to the same provider; override to mix providers.
EMBEDDING_MODEL = config('EMBEDDING_MODEL', default='text-embedding-3-small')
EMBEDDING_API_KEY = config('EMBEDDING_API_KEY', default='') or OPENAI_API_KEY
EMBEDDING_BASE_URL = config('EMBEDDING_BASE_URL', default='') or OPENAI_BASE_URL

# --- RAG pipeline -------------------------------------------------------------
RAG = {
    # Vector store. Changing EMBEDDING_MODEL requires `manage.py reindex_documents`.
    'CHROMA_PERSIST_DIR': config('CHROMA_PERSIST_DIR', default=str(DATA_DIR / 'chroma_db')),
    'CHROMA_COLLECTION': config('CHROMA_COLLECTION', default='rag_chunks'),
    # Chunking (in words)
    'CHUNK_SIZE': config('RAG_CHUNK_SIZE', default=300, cast=int),
    'CHUNK_OVERLAP': config('RAG_CHUNK_OVERLAP', default=50, cast=int),
    'EMBEDDING_BATCH_SIZE': config('RAG_EMBEDDING_BATCH_SIZE', default=64, cast=int),
    # Retrieval
    'TOP_K': config('RAG_TOP_K', default=5, cast=int),
    'MAX_TOP_K': 20,
    # Minimum cosine similarity (0..1) for a chunk to be used as context.
    'MIN_SCORE': config('RAG_MIN_SCORE', default=0.2, cast=float),
    'MAX_CONTEXT_CHARS': config('RAG_MAX_CONTEXT_CHARS', default=12000, cast=int),
    'MAX_HISTORY_MESSAGES': 6,
    # Uploads
    'MAX_UPLOAD_MB': config('RAG_MAX_UPLOAD_MB', default=20, cast=int),
}

# Logging Configuration
LOG_LEVEL = config('LOG_LEVEL', default='INFO')
LOG_FILE = config('LOG_FILE', default='')

LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'simple': {
            'format': '{levelname} {asctime} {name} {message}',
            'style': '{',
        },
    },
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
            'formatter': 'simple',
        },
        **({'file': {
            'class': 'logging.FileHandler',
            'filename': LOG_FILE,
            'formatter': 'simple',
        }} if LOG_FILE else {}),
    },
    'root': {
        'handlers': ['console', *(['file'] if LOG_FILE else [])],
        'level': 'WARNING',
    },
    'loggers': {
        'account': {'level': LOG_LEVEL},
        'rag': {'level': LOG_LEVEL},
        # Chroma / HTTP clients are chatty at INFO.
        'chromadb': {'level': 'WARNING'},
        'httpx': {'level': 'WARNING'},
    },
}
