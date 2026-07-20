FROM python:3.10-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app
COPY requirements.txt ./requirements.txt
RUN pip install --no-cache-dir --requirement requirements.txt \
    && addgroup --system app \
    && adduser --system --ingroup app app \
    && mkdir -p /app/data/corpus /app/storage/chroma \
    && chown -R app:app /app
COPY --chown=app:app app ./app
COPY --chown=app:app scripts ./scripts

USER app
EXPOSE 8001
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8001/ai/health', timeout=3)"
CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001"]
