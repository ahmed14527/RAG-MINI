# ---- Backend (Django + Daphne) ---------------------------------------------
FROM python:3.12-slim AS builder

ENV PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

COPY requirements/ /tmp/requirements/
RUN pip install -r /tmp/requirements/prod.txt


FROM python:3.12-slim AS runtime

ENV PATH="/opt/venv/bin:$PATH" \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DJANGO_SETTINGS_MODULE=project.settings.prod \
    DATA_DIR=/app/data

RUN groupadd --system --gid 1000 app && useradd --system --uid 1000 --gid app --home /app app

WORKDIR /app
COPY --from=builder /opt/venv /opt/venv
COPY --chown=app:app . .
RUN chmod +x docker/entrypoint.sh \
    # Admin static files (served by WhiteNoise). The key is only used for this step.
    && SECRET_KEY=collectstatic-only python manage.py collectstatic --noinput -v0 \
    && mkdir -p /app/data && chown app:app /app/data

USER app
EXPOSE 8000
VOLUME ["/app/data"]

HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/health/', timeout=4).status == 200 else 1)"

ENTRYPOINT ["docker/entrypoint.sh"]
CMD ["daphne", "-b", "0.0.0.0", "-p", "8000", "project.asgi:application"]
