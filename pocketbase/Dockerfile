FROM alpine:latest

# Устанавливаем зависимости
RUN apk add --no-cache ca-certificates unzip wget

# Скачиваем PocketBase
ARG PB_VERSION=0.22.12
RUN wget -q https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_amd64.zip \
    && unzip pocketbase_${PB_VERSION}_linux_amd64.zip \
    && chmod +x pocketbase

# Создаём директорию для данных
RUN mkdir -p /pb_data

EXPOSE 8090

CMD ["./pocketbase", "serve", "--http=0.0.0.0:8090", "--dir=/pb_data"]
