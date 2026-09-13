# Docker Build & Deployment Instructions

This guide will help you build and deploy the HaloPSA-enabled version of Uptime Kuma.

## Prerequisites

1. **Docker Desktop** installed and running on your local machine
   - Download from: https://www.docker.com/products/docker-desktop/
   - Make sure Docker is running (you should see the Docker icon in your system tray)

2. **Docker Hub Account**
   - Sign up at: https://hub.docker.com/
   - You'll push the image to: `alexisskeates/uptime-kuma:halopsa`

## Step 1: Install Docker (If Not Already Installed)

### macOS
```bash
# Download and install Docker Desktop from:
# https://www.docker.com/products/docker-desktop/

# After installation, start Docker Desktop from Applications
# Wait for it to fully start (icon will appear in menu bar)
```

### Linux
```bash
# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Start Docker
sudo systemctl start docker

# Add your user to docker group (to run without sudo)
sudo usermod -aG docker $USER
newgrp docker
```

### Windows
```powershell
# Download and install Docker Desktop from:
# https://www.docker.com/products/docker-desktop/

# Start Docker Desktop from Start Menu
# Wait for it to fully start
```

## Step 2: Build the Docker Image

### Option A: Using the Build Script (Recommended)

We've created a helper script that automates the entire process:

```bash
# Make sure you're in the uptime-kuma directory
cd "/Users/alexis/Documents/Claud Code/uptime-kuma"

# Run the build script
./build-and-push.sh
```

The script will:
1. ✅ Check Docker is running
2. ✅ Verify you're on the correct branch
3. ✅ Build the Docker image (takes 10-20 minutes)
4. ✅ Prompt you to login to Docker Hub if needed
5. ✅ Push the image to Docker Hub
6. ✅ Display the updated docker-compose.yml

### Option B: Manual Commands

If you prefer to run commands manually:

```bash
# 1. Navigate to the project directory
cd "/Users/alexis/Documents/Claud Code/uptime-kuma"

# 2. Build the Docker image
docker build \
    -f docker/dockerfile \
    -t alexisskeates/uptime-kuma:halopsa \
    --target release \
    .

# 3. Login to Docker Hub (if not already logged in)
docker login

# 4. Push the image to Docker Hub
docker push alexisskeates/uptime-kuma:halopsa
```

## Step 3: Deploy on Your Server

### Update docker-compose.yml

On your server, update your `docker-compose.yml` to:

```yaml
services:
  uptime-kuma:
    image: alexisskeates/uptime-kuma:halopsa
    container_name: uptime-kuma
    volumes:
      - ./data:/app/data
    networks:
      - proxy
    ports:
      - "3001:3001"
    restart: unless-stopped

networks:
  proxy:
    driver: bridge
```

**Or use the pre-made file:**

We've created `docker-compose.server.yml` for you. On your server:

```bash
# Backup your current compose file
cp docker-compose.yml docker-compose.yml.backup

# Replace with the new one (copy the contents of docker-compose.server.yml)
```

### Deploy the Updated Container

```bash
# On your server, pull the new image
docker pull alexisskeates/uptime-kuma:halopsa

# Stop and remove the old container
docker compose down

# Start the new container
docker compose up -d

# Check logs to verify it started correctly
docker compose logs -f uptime-kuma
```

## Step 4: Verify HaloPSA Integration

1. Open Uptime Kuma in your browser: `http://your-server:3001`
2. Go to **Settings** → **Notifications**
3. Click **Setup Notification**
4. In the **Notification Type** dropdown, you should see **HaloPSA**
5. If you see it, the integration is working! 🎉

## Troubleshooting

### Docker is not running
**Error**: `Cannot connect to the Docker daemon`

**Solution**:
- Start Docker Desktop
- Wait until you see "Docker Desktop is running" in the system tray
- Try the build command again

### Docker login fails
**Error**: `unauthorized: incorrect username or password`

**Solution**:
```bash
# Login with your Docker Hub credentials
docker login

# Enter your Docker Hub username (not email)
# Enter your Docker Hub password
```

### Build takes too long
The build process can take 10-20 minutes depending on your machine. This is normal because it's:
- Installing all npm dependencies
- Building the frontend (Vue.js)
- Building the backend (Node.js)
- Compiling health check binaries

### Out of disk space
**Error**: `no space left on device`

**Solution**:
```bash
# Clean up old Docker images
docker system prune -a

# This will free up space by removing:
# - Stopped containers
# - Unused networks
# - Dangling images
# - Build cache
```

### Image is private on Docker Hub
By default, Docker Hub images are public. If you want to make it private:

1. Go to https://hub.docker.com/
2. Navigate to your repository: `alexisskeates/uptime-kuma`
3. Click **Settings**
4. Under **Visibility**, select **Private**

If private, your server will need to login to pull:
```bash
docker login
# Enter credentials
docker pull alexisskeates/uptime-kuma:halopsa
```

## Updating the Image in the Future

When you make changes to the code:

```bash
# 1. Commit your changes
git add .
git commit -m "Update HaloPSA integration"
git push myfork feature/halopsa-integration

# 2. Rebuild and push the Docker image
./build-and-push.sh

# 3. On your server, pull and restart
docker pull alexisskeates/uptime-kuma:halopsa
docker compose down
docker compose up -d
```

## Alternative: Build Directly on Server

If you can't build on your local machine (no Docker), you can build directly on your server:

```bash
# On your server
mkdir -p ~/uptime-kuma-build
cd ~/uptime-kuma-build

# Clone your fork
git clone https://github.com/alexisskeates/uptime-kuma.git .
git checkout feature/halopsa-integration

# Build the image
docker build -f docker/dockerfile -t uptime-kuma-halopsa:local --target release .

# Update docker-compose.yml to use the local image
# Change: image: alexisskeates/uptime-kuma:halopsa
# To:     image: uptime-kuma-halopsa:local

# Start the container
docker compose up -d
```

## File Summary

- `build-and-push.sh` - Automated build and push script
- `docker-compose.server.yml` - Docker compose file for your server
- `HALOPSA_SETUP.md` - HaloPSA configuration guide
- `DOCKER_BUILD_INSTRUCTIONS.md` - This file

## Next Steps

After deployment:
1. ✅ Verify HaloPSA appears in notification types
2. ✅ Follow `HALOPSA_SETUP.md` to configure your HaloPSA API credentials
3. ✅ Create a test monitor and assign the HaloPSA notification
4. ✅ Test ticket creation by taking the monitor down

## Support

- HaloPSA Integration Issues: Check Uptime Kuma logs
- Docker Build Issues: Check Docker Desktop is running
- Server Deployment Issues: Check server logs with `docker compose logs`

Good luck! 🚀
