FROM oven/bun:latest

WORKDIR /app

RUN apt-get update && \
    apt-get install -y \
    ffmpeg \
    mpv \
    && rm -rf /var/lib/apt/lists/*

COPY package.json bun.lock* ./

RUN bun install --frozen-lockfile

COPY . .

RUN mkdir -p storage/auth storage/data storage/media storage/temp storage/thumbnails
    
EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

CMD ["bun", "src/index.js"]
