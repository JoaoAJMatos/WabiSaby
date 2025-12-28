FROM oven/bun:latest

WORKDIR /app

# Install system dependencies in a single layer
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    ffmpeg \
    mpv \
    yt-dlp \
    && rm -rf /var/lib/apt/lists/*

# Copy dependency files first for better layer caching
COPY package.json bun.lock* ./

# Install dependencies using Bun's optimized install
# --frozen-lockfile ensures reproducible builds
# --production installs only production dependencies (if any)
# --ignore-scripts skips postinstall (system deps already installed via apt-get)
RUN bun install --frozen-lockfile --production --ignore-scripts

# Copy application code
# This layer will be rebuilt only when code changes
COPY . .

# Storage directories are created automatically by initializeStorage() at runtime
# No need to create them here since they're mounted as volumes
    
EXPOSE 3000

# Set environment variables
ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0

# Use Bun's native runtime for optimal performance
# Using 'bun start' leverages the package.json script
CMD ["bun", "start"]
