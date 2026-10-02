"""
Clients for the embedding and chat models.

Both use the OpenAI SDK, so any OpenAI-compatible endpoint works
(OpenAI, Azure-compatible gateways, Ollama, LM Studio, vLLM, ...) via
OPENAI_BASE_URL / EMBEDDING_BASE_URL.
"""

import logging
import time
from collections.abc import AsyncIterator
from functools import lru_cache

import openai
from django.conf import settings

from ..errors import EmbeddingError, LLMError, ProviderNotConfiguredError

logger = logging.getLogger(__name__)

_NOT_CONFIGURED = "Set OPENAI_API_KEY (or EMBEDDING_API_KEY) in the server environment."


def _client_kwargs(api_key: str, base_url: str | None) -> dict:
    if not api_key:
        raise ProviderNotConfiguredError(_NOT_CONFIGURED)
    return {
        "api_key": api_key,
        "base_url": base_url,
        "timeout": settings.LLM_TIMEOUT_SECONDS,
        "max_retries": 2,
    }


def _user_message(exc: Exception, service: str) -> str:
    """Translate SDK errors into messages that are safe to show to users."""
    if isinstance(exc, openai.AuthenticationError):
        return f"The {service} provider rejected the configured API key."
    if isinstance(exc, openai.RateLimitError):
        return f"The {service} provider is rate limiting requests. Please try again shortly."
    if isinstance(exc, (openai.APITimeoutError, openai.APIConnectionError)):
        return f"Could not reach the {service} provider. Please try again."
    if isinstance(exc, openai.NotFoundError):
        return f"The configured {service} model was not found."
    return f"The {service} provider returned an error."


@lru_cache(maxsize=1)
def _embedding_client() -> openai.OpenAI:
    return openai.OpenAI(**_client_kwargs(settings.EMBEDDING_API_KEY, settings.EMBEDDING_BASE_URL))


@lru_cache(maxsize=1)
def _chat_client() -> openai.OpenAI:
    return openai.OpenAI(**_client_kwargs(settings.OPENAI_API_KEY, settings.OPENAI_BASE_URL))


def embed_texts(texts: list[str]) -> list[list[float]]:
    """Embed texts in batches; order of the result matches the input."""
    batch_size = settings.RAG['EMBEDDING_BATCH_SIZE']
    client = _embedding_client()
    embeddings: list[list[float]] = []
    try:
        for start in range(0, len(texts), batch_size):
            response = client.embeddings.create(
                model=settings.EMBEDDING_MODEL,
                input=texts[start:start + batch_size],
            )
            embeddings.extend(item.embedding for item in sorted(response.data, key=lambda d: d.index))
    except openai.OpenAIError as exc:
        logger.error("Embedding request failed: %s", type(exc).__name__)
        raise EmbeddingError(_user_message(exc, "embedding")) from exc
    return embeddings


def complete(messages: list[dict]) -> str:
    """Return the full chat completion for `messages`."""
    client = _chat_client()
    started = time.perf_counter()
    logger.info("LLM request started model=%s", settings.LLM_MODEL)
    try:
        response = client.chat.completions.create(
            model=settings.LLM_MODEL,
            messages=messages,
            temperature=settings.LLM_TEMPERATURE,
        )
    except openai.OpenAIError as exc:
        logger.error("LLM request failed: %s", type(exc).__name__)
        raise LLMError(_user_message(exc, "language model")) from exc
    answer = response.choices[0].message.content or ""
    logger.info("LLM request completed in %.0fms chars=%d", (time.perf_counter() - started) * 1000, len(answer))
    return answer


async def stream_completion(messages: list[dict]) -> AsyncIterator[str]:
    """Yield text deltas of a streamed chat completion."""
    kwargs = _client_kwargs(settings.OPENAI_API_KEY, settings.OPENAI_BASE_URL)
    started = time.perf_counter()
    chars = 0
    logger.info("LLM stream started model=%s", settings.LLM_MODEL)
    try:
        # A client per stream: async HTTP clients are bound to an event loop.
        async with openai.AsyncOpenAI(**kwargs) as client:
            stream = await client.chat.completions.create(
                model=settings.LLM_MODEL,
                messages=messages,
                temperature=settings.LLM_TEMPERATURE,
                stream=True,
            )
            async for event in stream:
                if not event.choices:
                    continue
                delta = event.choices[0].delta.content
                if delta:
                    chars += len(delta)
                    yield delta
    except openai.OpenAIError as exc:
        logger.error("LLM stream failed: %s", type(exc).__name__)
        raise LLMError(_user_message(exc, "language model")) from exc
    logger.info("LLM stream completed in %.0fms chars=%d", (time.perf_counter() - started) * 1000, chars)
