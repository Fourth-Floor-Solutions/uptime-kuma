#!/bin/bash

# Build and Push Script for HaloPSA Integration
# This script builds the Docker image and pushes it to Docker Hub

set -e  # Exit on error

echo "======================================"
echo "Uptime Kuma HaloPSA Build & Push"
echo "======================================"
echo ""

# Configuration
DOCKER_USERNAME="alexisskeates"
IMAGE_NAME="uptime-kuma"
TAG="halopsa"
FULL_IMAGE="${DOCKER_USERNAME}/${IMAGE_NAME}:${TAG}"

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Error: Docker is not running!"
    echo "Please start Docker Desktop and try again."
    exit 1
fi

echo "✅ Docker is running"
echo ""

# Check if we're on the correct branch
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" != "feature/halopsa-integration" ]; then
    echo "⚠️  Warning: You're on branch '$CURRENT_BRANCH'"
    echo "Expected: feature/halopsa-integration"
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

echo "📦 Building multi-platform Docker image: ${FULL_IMAGE}"
echo "Building for both ARM64 (Mac) and AMD64 (Linux servers)"
echo "This may take 15-30 minutes depending on your machine..."
echo ""

# Create buildx builder if it doesn't exist
docker buildx create --name multiplatform --use 2>/dev/null || docker buildx use multiplatform

# Build and push multi-platform image
# This builds for both ARM64 (Apple Silicon) and AMD64 (Linux servers)
docker buildx build \
    -f docker/dockerfile \
    --platform linux/amd64,linux/arm64 \
    --target release \
    -t "${FULL_IMAGE}" \
    --push \
    .

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Build and push successful!"
    echo ""
    echo "======================================"
    echo "🎉 All Done!"
    echo "======================================"
    echo ""
    echo "Your image is now available at:"
    echo "  ${FULL_IMAGE}"
    echo ""
    echo "Update your docker-compose.yml on your server to use:"
    echo ""
    echo "services:"
    echo "  uptime-kuma:"
    echo "    image: ${FULL_IMAGE}"
    echo "    container_name: uptime-kuma"
    echo "    volumes:"
    echo "      - ./data:/app/data"
    echo "    networks:"
    echo "      - proxy"
    echo "    ports:"
    echo "      - \"3001:3001\""
    echo "    restart: unless-stopped"
    echo ""
    echo "networks:"
    echo "  proxy:"
    echo "    driver: bridge"
    echo ""
else
    echo ""
    echo "❌ Push failed!"
    exit 1
fi
