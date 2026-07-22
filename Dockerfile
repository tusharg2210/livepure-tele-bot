# Use official Puppeteer image with Chromium preinstalled
FROM ghcr.io/puppeteer/puppeteer:latest

# Environment variables for production & Puppeteer
ENV NODE_ENV=production \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable \
    PORT=3000

# Set working directory in container
WORKDIR /usr/src/app

# Copy package definition files
COPY package*.json ./

# Install dependencies as root user before dropping privileges
USER root
RUN npm ci --only=production

# Copy application source code
COPY . .

# Set owner permissions for pptruser
RUN chown -R pptruser:pptruser /usr/src/app

# Switch to non-root puppeteer user for security
USER pptruser

# Expose server port
EXPOSE 3000

# Start Express server
CMD ["node", "server.js"]
