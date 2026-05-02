FROM python:3.11-slim
ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
WORKDIR /notebooks

RUN apt-get update \
 && apt-get install -y --no-install-recommends git build-essential \
 && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install --upgrade pip && pip install -r requirements.txt

EXPOSE 8888
CMD ["jupyter", "lab", "--ip=0.0.0.0", "--no-browser", "--allow-root", "--ServerApp.token=''", "--ServerApp.password=''"]
