# VibeTree Docker Setup

This guide explains how to run VibeTree in a Docker container, perfect for deployment on VMs like EC2 instances or any Docker-enabled environment.

## What is Docker?

Docker is a platform that packages applications and their dependencies into lightweight, portable containers. Think of it as a way to create a complete, self-contained version of your application that runs the same way everywhere.

**Key Docker Concepts:**

- **Image**: A blueprint/template containing your app and all its dependencies
- **Container**: A running instance of an image (like running a program)
- **Dockerfile**: Instructions for building your image (like a recipe)

## Prerequisites

1. **Docker installed** on your system
   - Download from [docker.com](https://www.docker.com/get-started)
   - Or install via package manager on Linux

2. **pnpm installed** (for the build process)
   - Install with: `npm install -g pnpm`

## Quick Start - Single Command Deployment

**Deploy VibeTree with just one command:**

```bash
npm run deploy
```

This command automatically:

- ✅ Builds the application locally
- ✅ Creates the Docker image
- ✅ Stops any existing container
- ✅ Starts a new container with proper configuration

### Access VibeTree

- **Web Interface**: http://localhost:3000
- **API Server**: http://localhost:3002
- **Health Check**: http://localhost:3002/health

### Stop the Container

```bash
docker stop vibetree-container
```

## Manual Steps (Advanced Users)

If you prefer to run the steps manually:

### 1. Build Locally

```bash
pnpm build:web && pnpm --filter @vibetree/server build
```

### 2. Build Docker Image

```bash
docker build -t vibetree-webapp .
```

### 3. Run Container

```bash
docker run -p 3000:3000 -p 3002:3002 --name vibetree-container vibetree-webapp
```

## Docker Scripts Reference

The following scripts are available in `package.json`:

```bash
# 🚀 One-command deployment (recommended)
npm run deploy

# Manual Docker commands
npm run docker:build    # Build Docker image
npm run docker:run      # Run container (persistent, named)
npm run docker:stop     # Stop and remove named container
npm run docker:dev      # Run container (temporary, auto-removed on stop)

# Docker Compose commands
npm run docker:compose          # Start services
npm run docker:compose:build    # Build and start services
npm run docker:compose:down     # Stop services
```

## Docker Compose (Advanced)

For more complex deployments, use Docker Compose:

```bash
# Start all services
docker-compose up

# Start services in background
docker-compose up -d

# Stop services
docker-compose down

# Rebuild and start
docker-compose up --build
```

The `docker-compose.yml` includes:

- **vibetree-server**: Backend API and WebSocket server
- **vibetree-web**: Frontend web application
- **nginx**: Optional reverse proxy (use profile: `--profile proxy`)

### Using with Nginx Proxy

```bash
# Start with Nginx reverse proxy
docker-compose --profile proxy up
```

Access via: http://localhost (port 80)

## Deployment on Cloud VMs

### AWS EC2 Example

1. **Launch EC2 instance** with Docker installed
2. **Clone your repository**:
   ```bash
   git clone <your-repo>
   cd vibe-tree
   ```
3. **Build locally** (if not using CI/CD):
   ```bash
   pnpm install
   pnpm build:web && pnpm --filter @vibetree/server build
   ```
4. **Build and run Docker container**:
   ```bash
   docker build -t vibetree-webapp .
   docker run -d -p 3000:3000 -p 3002:3002 --name vibetree vibetree-webapp
   ```
5. **Configure security group** to allow ports 3000 and 3002
6. **Access via public IP**: `http://your-ec2-ip:3000`

### Digital Ocean, Linode, etc.

The same process works on any cloud provider with Docker support.

## Environment Variables

Customize the container behavior with environment variables:

```bash
docker run -p 3000:3000 -p 3002:3002 \
  -e NODE_ENV=production \
  -e HOST=0.0.0.0 \
  -e PORT=3002 \
  -e WEB_PORT=3000 \
  vibetree-webapp
```

## Persistent Data

To persist data across container restarts, mount volumes:

```bash
docker run -p 3000:3000 -p 3002:3002 \
  -v /host/path/to/projects:/workspace \
  vibetree-webapp
```

## Troubleshooting

### Container Won't Start

- Check Docker daemon is running: `docker version`
- Verify ports are available: `netstat -tulpn | grep :3000`

### Build Fails

- Ensure local build completed: `pnpm build:web && pnpm --filter @vibetree/server build`
- Check Docker has enough resources (RAM/disk)

### Can't Access from Other Machines

- Ensure container binds to `0.0.0.0`: already configured
- Check firewall/security group settings
- Verify correct ports are exposed: `docker port vibetree-container`

### Health Check Fails

- Check server logs: `docker logs vibetree-container`
- Test health endpoint: `curl http://localhost:3002/health`

### Permission Issues

- Container runs as non-root user `vibetree` for security
- Ensure file permissions allow read access

## Development vs Production

### Development

```bash
# Quick development container (auto-removes on stop)
npm run docker:dev
```

### Production

```bash
# Persistent production container
npm run docker:run

# Or with restart policy
docker run -d --restart unless-stopped \
  -p 3000:3000 -p 3002:3002 \
  --name vibetree-prod \
  vibetree-webapp
```

## Monitoring

### View Logs

```bash
# View container logs
docker logs vibetree-container

# Follow logs in real-time
docker logs -f vibetree-container
```

### Container Stats

```bash
# View resource usage
docker stats vibetree-container
```

### Health Status

```bash
# Check container health
docker inspect vibetree-container | grep -i health
```

## Security Notes

- Container runs as non-root user `vibetree`
- Only necessary ports (3000, 3002) are exposed
- No sensitive data should be hardcoded in the image
- Use environment variables for configuration
- Keep base images updated for security patches

## Next Steps

1. Set up automated builds with CI/CD
2. Configure reverse proxy with SSL certificates
3. Set up monitoring and logging
4. Configure backup strategies for persistent data
5. Implement container orchestration (Kubernetes, Docker Swarm)
