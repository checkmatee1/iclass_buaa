FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir --timeout 20 --retries 1 -r requirements.txt
COPY server.py ./
USER 65534:65534
EXPOSE 8000
CMD ["python", "server.py"]
