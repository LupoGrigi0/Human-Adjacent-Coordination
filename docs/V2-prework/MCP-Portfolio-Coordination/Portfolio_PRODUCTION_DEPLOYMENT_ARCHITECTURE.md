# Production Deployment Architecture - SmoothCurves.art Portfolio

**Author**: Nova (Integration & System Architecture Specialist)
**Created**: 2025-10-02
**Version**: 2.0.0 - Updated with Existing Infrastructure Integration
**Last Updated**: 2025-10-02

---

## Executive Summary

This document provides the complete production deployment architecture for Lupo's Modern Art Portfolio website (SmoothCurves.art). After extensive research into Digital Ocean deployment options, Next.js production best practices, content deployment workflows, AND integration with existing droplet infrastructure, I recommend a **Droplet-based deployment with Docker Compose + Nginx** approach.

### Key Recommendations

1. **Infrastructure**: Docker Compose on **EXISTING** Digital Ocean droplet (smoothcurves.nexus)
2. **Cost**: $0 additional (leverages existing Nginx/SSL/Certbot setup)
3. **Deployment**: GitHub Actions for automated deploys
4. **Content Sync**: rsync over SSH for cross-platform content deployment
5. **SSL**: **USE EXISTING** Let's Encrypt/Certbot (already configured for smoothcurves.nexus)
6. **DNS**: Dynadot A records (subdomains supported via standard A records, no upsell needed)
7. **Coordination**: Collaborate with droplet-based Nova instance via MCP coordination system

### Critical Integration Points

✅ **Existing Nginx/SSL**: smoothcurves.nexus already has working Nginx + Let's Encrypt
✅ **Port Allocation**: Coordination system uses 3444-3449, portfolio will use 3000-3003
✅ **Multi-Domain Routing**: Nginx will route smoothcurves.{art,love,nexus} to appropriate containers
✅ **Port 80 Requirements**: smoothcurves.nexus:80 serves openapi.json for platform verification
✅ **DigitalOcean MCP**: Available for direct droplet management from local machine

---

## Table of Contents

1. [Infrastructure Architecture](#1-infrastructure-architecture)
2. [Deployment Options Analysis](#2-deployment-options-analysis)
3. [Next.js Production Configuration](#3-nextjs-production-configuration)
4. [Docker Architecture](#4-docker-architecture)
5. [Domain & SSL Setup](#5-domain--ssl-setup)
6. [CI/CD Pipeline](#6-cicd-pipeline)
7. [Content Deployment Workflow](#7-content-deployment-workflow)
8. [Monitoring & Maintenance](#8-monitoring--maintenance)
9. [DigitalOcean MCP Integration](#9-digitalocean-mcp-integration)
10. [Collaboration Workflow (Local ↔ Droplet Nova Instances)](#10-collaboration-workflow)
11. [Step-by-Step Implementation](#11-step-by-step-implementation)
12. [Cost Analysis](#12-cost-analysis)

---

## 1. Infrastructure Architecture

### 1.1 Overview - Integrated with Existing Infrastructure

```
┌──────────────────────────────────────────────────────────────────────┐
│             PRODUCTION ARCHITECTURE - EXISTING DROPLET               │
│                     smoothcurves.nexus                               │
└──────────────────────────────────────────────────────────────────────┘

Internet
   │
   ├─ smoothcurves.art ─────┐
   ├─ www.smoothcurves.art ─┤
   ├─ smoothcurves.love ────┤
   ├─ dev.smoothcurves.art ─┤
   ├─ smoothcurves.nexus ───┤  (Coordination System)
   └─ mcp.smoothcurves.nexus│  (Future: MCP vanity URL)
                            │
Dynadot DNS (A Records)     │
   │                        │
   └─ All point to: DROPLET_IP (Same droplet)

Digital Ocean Droplet: smoothcurves.nexus (Ubuntu 22.04)
   │
   ├─ Nginx (Port 80/443) ─ EXISTING SSL (Let's Encrypt)
   │   │
   │   ├─ smoothcurves.art → localhost:3000 (portfolio prod frontend)
   │   ├─ smoothcurves.art/api → localhost:4000 (portfolio prod backend)
   │   │
   │   ├─ dev.smoothcurves.art → localhost:3001 (portfolio dev frontend)
   │   ├─ dev.smoothcurves.art/api → localhost:4001 (portfolio dev backend)
   │   │
   │   ├─ smoothcurves.nexus → localhost:3444 (coordination system EXISTING)
   │   ├─ smoothcurves.nexus:80/openapi.json (platform verification REQUIRED)
   │   │
   │   └─ smoothcurves.love → 301 redirect to smoothcurves.art
   │
   ├─ Services & Containers
   │   │
   │   ├─ EXISTING: Coordination System
   │   │   ├─ MCP Server (3444-3445) ← ACTIVE
   │   │   ├─ Dev MCP Server (3446-3447) ← ACTIVE
   │   │   └─ Data: /mnt/coordinaton_mcp_data/
   │   │
   │   ├─ NEW: Portfolio Production
   │   │   ├─ portfolio-frontend-prod (3000)
   │   │   ├─ portfolio-backend-prod (4000)
   │   │   └─ portfolio-redis-prod (6379)
   │   │
   │   └─ NEW: Portfolio Dev
   │       ├─ portfolio-frontend-dev (3001)
   │       ├─ portfolio-backend-dev (4001)
   │       └─ portfolio-redis-dev (6380)
   │
   ├─ Volumes
   │   ├─ /mnt/lupoportfolio (EXISTING - Portfolio content/data)
   │   │   ├── portfolio-prod/
   │   │   ├── portfolio-dev/
   │   │   ├── backups/
   │   │   └── scripts/
   │   │
   │   └─ /mnt/coordinaton_mcp_data (EXISTING - Coordination system)
   │       ├── production/
   │       └── Human-Adjacent-Coordination/
   │
   └─ Management Tools
       ├─ Claude Code (VSCode Remote SSH) ← ACTIVE
       ├─ Codex instance ← ACTIVE
       └─ DigitalOcean MCP (available for install)
```

### 1.2 Port Allocation - Complete Mapping

| Service | Port(s) | Status | Domain Routing |
|---------|---------|--------|----------------|
| **Coordination System (Prod)** | 3444-3445 | ✅ ACTIVE | smoothcurves.nexus/mcp |
| **Coordination System (Dev)** | 3446-3447 | ✅ ACTIVE | smoothcurves.nexus/mcp/dev |
| **Portfolio Frontend (Prod)** | 3000 | 🆕 NEW | smoothcurves.art |
| **Portfolio Backend (Prod)** | 4000 | 🆕 NEW | smoothcurves.art/api |
| **Portfolio Frontend (Dev)** | 3001 | 🆕 NEW | dev.smoothcurves.art |
| **Portfolio Backend (Dev)** | 4001 | 🆕 NEW | dev.smoothcurves.art/api |
| **Redis (Portfolio Prod)** | 6379 | 🆕 NEW | Internal only |
| **Redis (Portfolio Dev)** | 6380 | 🆕 NEW | Internal only |
| **Nginx HTTP** | 80 | ✅ ACTIVE | All domains (redirect to 443) |
| **Nginx HTTPS** | 443 | ✅ ACTIVE | All domains (SSL termination) |
| **SSH** | 22 | ✅ ACTIVE | Server management |

**Note**: Ports 3000-3003 available for portfolio, no conflicts with coordination system (3444-3449)

### 1.2 Service Allocation

| Service | Production | Dev | Notes |
|---------|-----------|-----|-------|
| Frontend | Port 3000 | Port 3001 | Next.js (standalone mode) |
| Backend | Port 4000 | Port 4001 | Express + TypeScript |
| Redis | Port 6379 | Port 6380 | Caching, sessions |
| Nginx | Ports 80/443 | Ports 80/443 | Reverse proxy, SSL |

### 1.3 Why This Architecture?

✅ **Cost-Effective**: $0 additional, uses existing droplet
✅ **Leverages Existing Volume**: /mnt/lupoportfolio already provisioned
✅ **Isolated Environments**: Docker provides dev/prod separation
✅ **Team-Friendly**: Consistent environments across all developers
✅ **Full Control**: Direct access for debugging, no platform lock-in
✅ **Simple CI/CD**: GitHub Actions with SSH (free tier)
✅ **Works with Dynadot**: No DNS migration needed

---

## 2. Deployment Options Analysis

### 2.1 Comparison Matrix

| Option | Cost/Month | Pros | Cons | Verdict |
|--------|-----------|------|------|---------|
| **Droplet + Docker (RECOMMENDED)** | $0 | Uses existing infra, full control, $0 cost | Manual Nginx setup | ✅ **BEST FIT** |
| App Platform | $12-24 | Managed, auto-SSL | Requires DO DNS, doesn't use volume, adds cost | ❌ Not recommended |
| PM2 on Droplet | $0 | Simple, lightweight | Less isolation, manual deps | ⚠️ Viable but suboptimal |
| Container Registry + Droplet | $5+ | Centralized images | Extra complexity for single droplet | ❌ Overkill |

### 2.2 Detailed Analysis: Digital Ocean App Platform

**Research Findings**:
- **Pricing**: $12/month minimum for dynamic Next.js apps (not eligible for free static tier due to Express backend)
- **Critical Limitation**: Requires DNS nameservers pointed to DigitalOcean for automatic Let's Encrypt SSL
- **Volume Issue**: Cannot leverage existing /mnt/lupoportfolio volume
- **Infrastructure Duplication**: Still need existing droplet for coordination system, creating two separate systems to maintain

**Decision**: ❌ **Not recommended** - Doesn't integrate with existing infrastructure, adds $144/year cost, DNS migration requirement

### 2.3 Recommended: Droplet + Docker Compose

**Why This Wins**:

1. **Zero Additional Cost**: Uses existing droplet and /mnt/lupoportfolio volume
2. **Existing Infrastructure**: You already have Dockerfile.frontend and Dockerfile.backend
3. **Team Familiarity**: Team already uses Docker for development
4. **Flexibility**: Easy to add new services (coordination system already running)
5. **Control**: Direct SSH access for debugging, log inspection, rollback
6. **External DNS Compatible**: Works with Dynadot without changes

---

## 3. Next.js Production Configuration

### 3.1 Standalone Output Mode (CRITICAL)

Your Dockerfiles reference `.next/standalone` but `next.config.ts` doesn't enable it yet.

**Required Change**:

**File**: `src/frontend/next.config.ts`
```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',  // ADD THIS LINE

  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '4000',
        pathname: '/api/media/**',
      },
      // ADD FOR PRODUCTION:
      {
        protocol: 'https',
        hostname: 'smoothcurves.art',
        port: '',
        pathname: '/api/media/**',
      },
    ],
    qualities: [75, 90, 100],
  },
};

export default nextConfig;
```

**What Standalone Mode Does**:
- Reduces Docker image size by ~80% (only copies required dependencies)
- Creates minimal `server.js` for production
- Automatic dependency tracing
- Perfect for Docker deployment

### 3.2 SSR vs SSG Strategy

**Recommendation**: **Hybrid approach** - mostly SSG with selective SSR

**For SmoothCurves.art**:
- ✅ **Use SSG for**: Gallery pages, collection pages, about page (90% of site)
  - Pre-rendered at build time
  - Served instantly (~100ms load time)
  - Minimal server resources
  - Perfect for low traffic (1-2 visitors/month)

- ✅ **Use SSR/API routes for**: Contact forms, analytics, dynamic features (10% of site)
  - Only when real-time data needed
  - Can still cache aggressively

**Performance Impact**:
- SSG: ~100ms page load (static HTML)
- SSR: ~500ms page load (server rendering)
- **For 1-2 visitors/month, either works fine**, but SSG is faster and cheaper

### 3.3 Frontend/Backend Separation

**RECOMMENDATION**: **Separate containers** (you already have this!)

**Why Separate Wins**:
1. ✅ You already have Dockerfile.frontend and Dockerfile.backend
2. ✅ Independent scaling and restarts
3. ✅ Better development workflow (frontend/backend teams work independently)
4. ✅ Clearer debugging and logging
5. ✅ Different update cycles (content updates vs API changes)

**Safari Cookie Issue**: Research shows Safari blocks cross-domain cookies. Solution: Nginx reverse proxy on same domain:
```
smoothcurves.art → frontend (port 3000)
smoothcurves.art/api → backend (port 4000)
```

---

## 4. Docker Architecture

### 4.1 Production docker-compose.prod.yml

**File**: `docker-compose.prod.yml` (in repo root)

```yaml
version: '3.8'

services:
  frontend:
    build:
      context: .
      dockerfile: src/infrastructure/Dockerfile.frontend
      target: production
    container_name: portfolio-frontend-prod
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - NEXT_PUBLIC_API_URL=https://smoothcurves.art/api
    depends_on:
      - backend
    networks:
      - portfolio-network
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

  backend:
    build:
      context: .
      dockerfile: src/infrastructure/Dockerfile.backend
      target: production
    container_name: portfolio-backend-prod
    restart: unless-stopped
    ports:
      - "4000:4000"
    volumes:
      - /mnt/lupoportfolio/portfolio-prod/data:/app/data
      - /mnt/lupoportfolio/portfolio-prod/logs:/app/logs
      - /mnt/lupoportfolio/portfolio-prod/content:/app/content:ro
    environment:
      - NODE_ENV=production
      - PORT=4000
      - FRONTEND_URL=https://smoothcurves.art
      - DATABASE_PATH=/app/data/portfolio.sqlite
      - REDIS_URL=redis://redis:6379
      - CONTENT_PATH=/app/content
      - LOG_PATH=/app/logs
    depends_on:
      - redis
    networks:
      - portfolio-network
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

  redis:
    image: redis:7-alpine
    container_name: portfolio-redis-prod
    restart: unless-stopped
    ports:
      - "6379:6379"
    volumes:
      - /mnt/lupoportfolio/portfolio-prod/data/redis:/data
    command: redis-server --appendonly yes
    networks:
      - portfolio-network
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

networks:
  portfolio-network:
    driver: bridge
```

### 4.2 Dev docker-compose.dev.yml

**File**: `docker-compose.dev.yml`

```yaml
version: '3.8'

services:
  frontend:
    build:
      context: .
      dockerfile: src/infrastructure/Dockerfile.frontend
      target: production
    container_name: portfolio-frontend-dev
    restart: unless-stopped
    ports:
      - "3001:3000"  # Different external port
    environment:
      - NODE_ENV=development
      - NEXT_PUBLIC_API_URL=https://dev.smoothcurves.art/api
    depends_on:
      - backend
    networks:
      - portfolio-dev-network

  backend:
    build:
      context: .
      dockerfile: src/infrastructure/Dockerfile.backend
      target: production
    container_name: portfolio-backend-dev
    restart: unless-stopped
    ports:
      - "4001:4000"  # Different external port
    volumes:
      - /mnt/lupoportfolio/portfolio-dev/data:/app/data
      - /mnt/lupoportfolio/portfolio-dev/logs:/app/logs
      - /mnt/lupoportfolio/portfolio-dev/content:/app/content:ro
    environment:
      - NODE_ENV=development
      - PORT=4000
      - FRONTEND_URL=https://dev.smoothcurves.art
      - DATABASE_PATH=/app/data/portfolio.sqlite
      - REDIS_URL=redis://redis:6379
      - CONTENT_PATH=/app/content
      - LOG_PATH=/app/logs
    depends_on:
      - redis
    networks:
      - portfolio-dev-network

  redis:
    image: redis:7-alpine
    container_name: portfolio-redis-dev
    restart: unless-stopped
    ports:
      - "6380:6379"  # Different external port
    volumes:
      - /mnt/lupoportfolio/portfolio-dev/data/redis:/data
    command: redis-server --appendonly yes
    networks:
      - portfolio-dev-network

networks:
  portfolio-dev-network:
    driver: bridge
```

### 4.3 Directory Structure on Droplet

```
/mnt/lupoportfolio/
├── portfolio-prod/               # Production deployment
│   ├── .git/                     # Git clone of main branch
│   ├── docker-compose.prod.yml
│   ├── .env.production
│   ├── data/
│   │   ├── portfolio.sqlite      # Production database
│   │   └── redis/                # Redis persistence
│   ├── content/                  # Art portfolio content (synced from local)
│   └── logs/
│       ├── frontend.log
│       └── backend.log
│
├── portfolio-dev/                # Dev deployment
│   ├── .git/                     # Git clone of develop branch
│   ├── docker-compose.dev.yml
│   ├── .env.development
│   ├── data/
│   └── content/                  # Dev content (can differ from prod)
│
├── backups/                      # Automated backups
│   ├── content_backup_20251002_143022/
│   ├── db_backup_20251002.sqlite
│   └── ...
│
└── scripts/                      # Deployment scripts
    ├── deploy-prod.sh
    ├── deploy-dev.sh
    ├── backup-portfolio.sh
    └── content-sync.sh
```

---

## 5. Domain & SSL Setup

### 5.1 DNS Configuration at Dynadot

**Recommended**: Keep DNS at Dynadot (no migration needed)

**A Records to Create**:
```
Type: A    Host: @              Value: YOUR_DROPLET_IP    TTL: 300
Type: A    Host: www            Value: YOUR_DROPLET_IP    TTL: 300
Type: A    Host: dev            Value: YOUR_DROPLET_IP    TTL: 300
```

**Repeat for both domains**:
- smoothcurves.art
- smoothcurves.love

**Propagation Time**: 5-30 minutes

### 5.2 SSL with Let's Encrypt (Certbot)

**Installation on Droplet**:
```bash
sudo apt update
sudo apt install certbot python3-certbot-nginx -y
```

**Generate Certificates**:
```bash
# Production domains
sudo certbot --nginx -d smoothcurves.art -d www.smoothcurves.art
sudo certbot --nginx -d smoothcurves.love -d www.smoothcurves.love

# Dev domain
sudo certbot --nginx -d dev.smoothcurves.art

# Test auto-renewal
sudo certbot renew --dry-run
```

**What Certbot Does**:
- ✅ Generates SSL certificates (free)
- ✅ Updates Nginx config automatically
- ✅ Sets up auto-renewal cron job (runs twice daily)
- ✅ Graceful Nginx reload (zero downtime)

**Certificate Renewal**:
- Automatic via cron: `/etc/cron.d/certbot`
- Runs: `0 */12 * * * root certbot -q renew --nginx`
- Checks if certs expire within 30 days
- Zero downtime during renewal (Nginx graceful reload)

### 5.3 Nginx Configuration - Integration with Existing Setup

**IMPORTANT**: Nginx and SSL already configured for smoothcurves.nexus. We will ADD portfolio routing to existing configuration.

**File**: `/etc/nginx/sites-available/smoothcurves.art` (NEW - Portfolio routing)

```nginx
# IMPORTANT: Port 80 must handle multiple requirements:
# 1. HTTP→HTTPS redirect for portfolio domains
# 2. Direct HTTP access for smoothcurves.nexus/openapi.json (platform verification)

# Portfolio domains - Redirect HTTP to HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name smoothcurves.art www.smoothcurves.art smoothcurves.love www.smoothcurves.love dev.smoothcurves.art;
    return 301 https://$server_name$request_uri;
}

# smoothcurves.nexus HTTP - ALLOW direct access for openapi.json
# (Already configured in existing coordination system Nginx config)
# DO NOT redirect port 80 for smoothcurves.nexus!

# Production - smoothcurves.art
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name smoothcurves.art www.smoothcurves.art;

    # SSL certificates (managed by Certbot)
    ssl_certificate /etc/letsencrypt/live/smoothcurves.art/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/smoothcurves.art/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Frontend - Next.js
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Backend API
    location /api {
        proxy_pass http://localhost:4000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Static assets with aggressive caching
    location /_next/static {
        proxy_pass http://localhost:3000;
        expires 1y;
        add_header Cache-Control "public, immutable, max-age=31536000";
    }

    # Media files
    location ~* \.(jpg|jpeg|png|gif|webp|svg|mp4)$ {
        proxy_pass http://localhost:3000;
        expires 30d;
        add_header Cache-Control "public, max-age=2592000";
    }
}

# Redirect smoothcurves.love to smoothcurves.art (optional)
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name smoothcurves.love www.smoothcurves.love;

    ssl_certificate /etc/letsencrypt/live/smoothcurves.love/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/smoothcurves.love/privkey.pem;

    return 301 https://smoothcurves.art$request_uri;
}

# Dev environment - dev.smoothcurves.art
server {
    listen 80;
    server_name dev.smoothcurves.art;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name dev.smoothcurves.art;

    ssl_certificate /etc/letsencrypt/live/dev.smoothcurves.art/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/dev.smoothcurves.art/privkey.pem;

    # Frontend dev
    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # Backend dev API
    location /api {
        proxy_pass http://localhost:4001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
    }
}
```

**Enable Configuration**:
```bash
sudo ln -s /etc/nginx/sites-available/smoothcurves.art /etc/nginx/sites-enabled/
sudo nginx -t  # Test configuration
sudo systemctl reload nginx
```

---

## 6. CI/CD Pipeline

### 6.1 GitHub Actions Workflow - Dev Auto-Deploy

**File**: `.github/workflows/deploy-dev.yml`

```yaml
name: Deploy to Dev

on:
  push:
    branches:
      - develop
      - feature/*
      - integration

jobs:
  deploy-dev:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Deploy to Dev Environment
        uses: appleboy/ssh-action@v1.0.0
        with:
          host: ${{ secrets.DROPLET_IP }}
          username: ${{ secrets.DROPLET_USER }}
          key: ${{ secrets.SSH_PRIVATE_KEY }}
          script: |
            cd /mnt/lupoportfolio/portfolio-dev

            # Pull latest changes
            git fetch origin
            git checkout ${{ github.ref_name }}
            git pull origin ${{ github.ref_name }}

            # Build and deploy
            docker compose -f docker-compose.dev.yml build
            docker compose -f docker-compose.dev.yml up -d

            # Cleanup old images
            docker system prune -f

      - name: Health Check
        run: |
          sleep 15
          curl --fail https://dev.smoothcurves.art/api/health || exit 1

      - name: Notify Success
        if: success()
        run: echo "✅ Dev deployment successful - https://dev.smoothcurves.art"
```

### 6.2 GitHub Actions Workflow - Production Manual Deploy

**File**: `.github/workflows/deploy-prod.yml`

```yaml
name: Deploy to Production

on:
  push:
    branches: [ main ]
  workflow_dispatch:  # Manual trigger button

jobs:
  deploy-prod:
    runs-on: ubuntu-latest
    environment: production  # Requires manual approval in GitHub settings

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Deploy to Production
        uses: appleboy/ssh-action@v1.0.0
        with:
          host: ${{ secrets.DROPLET_IP }}
          username: ${{ secrets.DROPLET_USER }}
          key: ${{ secrets.SSH_PRIVATE_KEY }}
          script: |
            cd /mnt/lupoportfolio/portfolio-prod

            # Backup current containers
            echo "📦 Creating backup..."
            docker tag portfolio-frontend-prod portfolio-frontend-prod-backup || true
            docker tag portfolio-backend-prod portfolio-backend-prod-backup || true

            # Pull latest changes
            echo "🔄 Pulling latest code..."
            git pull origin main

            # Build new containers
            echo "🔨 Building containers..."
            docker compose -f docker-compose.prod.yml build

            # Deploy
            echo "🚀 Deploying..."
            docker compose -f docker-compose.prod.yml up -d

            # Health check with rollback
            echo "🏥 Running health check..."
            sleep 20
            if ! curl --fail https://smoothcurves.art/api/health; then
              echo "❌ Health check failed! Rolling back..."
              docker compose -f docker-compose.prod.yml down
              docker tag portfolio-frontend-prod-backup portfolio-frontend-prod || true
              docker tag portfolio-backend-prod-backup portfolio-backend-prod || true
              docker compose -f docker-compose.prod.yml up -d
              exit 1
            fi

            echo "✅ Deployment successful!"

            # Cleanup
            docker system prune -f

      - name: Notify Success
        if: success()
        run: echo "✅ Production deployment successful - https://smoothcurves.art"

      - name: Notify Failure
        if: failure()
        run: echo "❌ Production deployment failed - rolled back to previous version"
```

### 6.3 GitHub Secrets Configuration

**Required Secrets** (Settings → Secrets and variables → Actions):

```
DROPLET_IP=your.droplet.ip.address
DROPLET_USER=deployuser
SSH_PRIVATE_KEY=<contents of ~/.ssh/lupoportfolio_ed25519>
```

**How to Generate SSH Key for GitHub Actions**:
```bash
# On your local machine
ssh-keygen -t ed25519 -f ~/.ssh/github-actions-portfolio -C "github-actions-deploy"

# Copy public key to droplet
ssh-copy-id -i ~/.ssh/github-actions-portfolio.pub deployuser@your-droplet-ip

# Copy private key for GitHub Secret
cat ~/.ssh/github-actions-portfolio
# Paste entire contents into GitHub Secret: SSH_PRIVATE_KEY
```

### 6.4 Manual Deployment Script (One-Button Deploy)

**File**: `/mnt/lupoportfolio/scripts/deploy-prod.sh`

```bash
#!/bin/bash
set -e

echo "🚀 Deploying SmoothCurves.art to Production"
echo "=========================================="

cd /mnt/lupoportfolio/portfolio-prod

# Backup
echo "📦 Creating backup..."
docker tag portfolio-frontend-prod portfolio-frontend-prod-backup || true
docker tag portfolio-backend-prod portfolio-backend-prod-backup || true

# Pull and build
echo "🔄 Pulling latest changes..."
git pull origin main

echo "🔨 Building containers..."
docker compose -f docker-compose.prod.yml build

# Deploy
echo "🚀 Starting services..."
docker compose -f docker-compose.prod.yml up -d

# Health check
echo "🏥 Running health check..."
sleep 20
if curl --fail https://smoothcurves.art/api/health; then
    echo "✅ Deployment successful!"
    docker system prune -f
else
    echo "❌ Health check failed! Rolling back..."
    docker compose -f docker-compose.prod.yml down
    docker tag portfolio-frontend-prod-backup portfolio-frontend-prod
    docker tag portfolio-backend-prod-backup portfolio-backend-prod
    docker compose -f docker-compose.prod.yml up -d
    exit 1
fi
```

**Make executable**:
```bash
chmod +x /mnt/lupoportfolio/scripts/deploy-prod.sh
```

**Usage**:
```bash
# SSH to droplet
ssh deployuser@your-droplet-ip

# Deploy production
/mnt/lupoportfolio/scripts/deploy-prod.sh
```

---

## 7. Content Deployment Workflow

### 7.1 Overview

**Content Flow**:
```
Local Machine (E:\mnt\lupoportfolio\content)
    ↓
rsync over SSH (port 22)
    ↓
Droplet (/mnt/lupoportfolio/portfolio-prod/content)
    ↓
Docker Volume Mount (backend container)
    ↓
Backend Content Scanner (auto-processes on change)
    ↓
Frontend (serves optimized images)
```

### 7.2 Cross-Platform Deployment Script

**File**: `scripts/deploy-content.sh` (Linux/Mac/WSL2)

```bash
#!/bin/bash
set -euo pipefail

# Configuration
LOCAL_CONTENT="E:/mnt/lupoportfolio/content"  # Windows: /mnt/e/mnt/lupoportfolio/content
REMOTE_USER="deployuser"
REMOTE_HOST="your-droplet-ip"
REMOTE_PATH="/mnt/lupoportfolio/portfolio-prod/content"
SSH_KEY="$HOME/.ssh/lupoportfolio_ed25519"

# Validation
echo "🔍 Validating prerequisites..."
if [[ ! -f "$SSH_KEY" ]]; then
    echo "❌ SSH key not found: $SSH_KEY"
    exit 1
fi

if [[ ! -d "$LOCAL_CONTENT" ]]; then
    echo "❌ Local content directory not found: $LOCAL_CONTENT"
    exit 1
fi

# Test SSH connection
if ! ssh -i "$SSH_KEY" -o ConnectTimeout=10 "$REMOTE_USER@$REMOTE_HOST" "exit" 2>/dev/null; then
    echo "❌ Cannot connect to remote server"
    exit 1
fi

echo "✅ Prerequisites validated"

# Backup remote content
echo "📦 Creating remote backup..."
ssh -i "$SSH_KEY" "$REMOTE_USER@$REMOTE_HOST" bash <<EOF
    cd /mnt/lupoportfolio
    mkdir -p backups
    if [[ -d portfolio-prod/content ]]; then
        backup_name="content_backup_\$(date +%Y%m%d_%H%M%S)"
        cp -al portfolio-prod/content "backups/\$backup_name"
        echo "Backup created: backups/\$backup_name"
        ls -t backups | tail -n +6 | xargs -I {} rm -rf backups/{}
    fi
EOF

echo "✅ Remote backup created"

# Sync content
echo "🚀 Starting content sync..."
rsync -avz --progress --stats \
    --delete-after \
    --exclude='.thumbnails' \
    --exclude='.DS_Store' \
    --exclude='Thumbs.db' \
    --checksum \
    -e "ssh -i $SSH_KEY" \
    "$LOCAL_CONTENT/" \
    "$REMOTE_USER@$REMOTE_HOST:$REMOTE_PATH/" \
    || {
        echo "❌ Sync failed!"
        exit 1
    }

echo "✅ Content sync completed"

# Validation
echo "🔍 Validating sync..."
local_count=$(find "$LOCAL_CONTENT" -type f \( -iname "*.jpg" -o -iname "*.png" \) | wc -l)
remote_count=$(ssh -i "$SSH_KEY" "$REMOTE_USER@$REMOTE_HOST" \
    "find $REMOTE_PATH -type f \( -iname '*.jpg' -o -iname '*.png' \) | wc -l")

echo "Local files: $local_count"
echo "Remote files: $remote_count"

if [[ "$local_count" -eq "$remote_count" ]]; then
    echo "✅ File counts match"
else
    echo "⚠️  File count mismatch (may be normal if files were excluded)"
fi

echo ""
echo "=========================================="
echo "✅ Content deployment completed!"
echo "=========================================="
```

### 7.3 Windows PowerShell Version

**File**: `scripts/Deploy-Content.ps1`

```powershell
param(
    [switch]$DryRun
)

$Config = @{
    LocalContent  = "E:\mnt\lupoportfolio\content"
    RemoteHost    = "your-droplet-ip"
    RemoteUser    = "deployuser"
    RemotePath    = "/mnt/lupoportfolio/portfolio-prod/content"
    SSHKeyPath    = "$env:USERPROFILE\.ssh\lupoportfolio_ed25519.ppk"
}

Write-Host "🚀 Deploying Content to SmoothCurves.art" -ForegroundColor Cyan

# Use WinSCP or WSL2 rsync
# See full implementation in content deployment research document
```

### 7.4 One-Command Deployment

**Usage**:
```bash
# Dry run (preview changes)
DRY_RUN=true ./scripts/deploy-content.sh

# Actual deployment
./scripts/deploy-content.sh
```

**Expected Performance**:
- Initial sync (50,000 images @ 2GB): ~10-20 minutes
- Incremental sync (only changed files): <1 minute
- Rollback time: <30 seconds

---

## 8. Monitoring & Maintenance

### 8.1 Health Checks

**Backend Health Endpoint**: `/api/health`

```typescript
// src/backend/src/routes/health.ts
router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV
  });
});
```

**Monitoring Script**:
```bash
#!/bin/bash
# /mnt/lupoportfolio/scripts/health-check.sh

curl --fail https://smoothcurves.art/api/health || {
    echo "❌ Production health check failed"
    # Send alert (email, Slack, etc.)
    exit 1
}

curl --fail https://dev.smoothcurves.art/api/health || {
    echo "⚠️  Dev health check failed"
    exit 1
}

echo "✅ All services healthy"
```

### 8.2 Automated Backups

**File**: `/mnt/lupoportfolio/scripts/backup-portfolio.sh`

```bash
#!/bin/bash
BACKUP_DIR="/mnt/lupoportfolio/backups/$(date +%Y-%m-%d)"
mkdir -p "$BACKUP_DIR"

# Backup production database
echo "📦 Backing up database..."
cp /mnt/lupoportfolio/portfolio-prod/data/portfolio.sqlite "$BACKUP_DIR/"

# Backup Redis data
echo "📦 Backing up Redis..."
tar czf "$BACKUP_DIR/redis-data.tar.gz" /mnt/lupoportfolio/portfolio-prod/data/redis/

# Content backup (hard links for efficiency)
echo "📦 Backing up content..."
cp -al /mnt/lupoportfolio/portfolio-prod/content "$BACKUP_DIR/"

# Keep only last 7 days
find /mnt/lupoportfolio/backups/ -type d -mtime +7 -exec rm -rf {} + 2>/dev/null

echo "✅ Backup completed: $BACKUP_DIR"
```

**Cron Job** (daily at 3 AM):
```bash
sudo crontab -e
# Add:
0 3 * * * /mnt/lupoportfolio/scripts/backup-portfolio.sh >> /var/log/portfolio-backup.log 2>&1
```

### 8.3 Log Monitoring

**View Logs**:
```bash
# Production logs
docker logs -f portfolio-frontend-prod
docker logs -f portfolio-backend-prod

# All production containers
docker compose -f /mnt/lupoportfolio/portfolio-prod/docker-compose.prod.yml logs -f

# Application logs (from volume mount)
tail -f /mnt/lupoportfolio/portfolio-prod/logs/backend.log
tail -f /mnt/lupoportfolio/portfolio-prod/logs/frontend.log
```

### 8.4 Resource Monitoring

```bash
# Container resource usage
docker stats portfolio-frontend-prod portfolio-backend-prod portfolio-redis-prod

# Disk space
df -h /mnt/lupoportfolio

# Memory usage
free -h
```

---

## 9. DigitalOcean MCP Integration

### 9.1 Overview

The DigitalOcean MCP server provides **direct droplet management capabilities** through Claude Code, enabling infrastructure operations via natural language commands.

**Official Repository**: https://github.com/digitalocean/digitalocean-mcp

**Capabilities**:
- ✅ Manage droplets (create, resize, snapshot, monitor)
- ✅ View account info, billing, invoices
- ✅ Manage domains, DNS records, SSL certificates
- ✅ Configure firewalls, VPCs, load balancers
- ✅ Deploy to App Platform (not needed for our droplet-based approach)
- ✅ Manage block storage volumes (including /mnt/lupoportfolio)

### 9.2 Installation on Local Machine

**For Claude Code (Local Development)**:

```bash
# Install DigitalOcean MCP server
claude mcp add digitalocean-mcp \
  -e DIGITALOCEAN_API_TOKEN=YOUR_DO_API_TOKEN \
  -- npx "@digitalocean/mcp"
```

**Prerequisites**:
1. **DigitalOcean API Token**: Create at https://cloud.digitalocean.com/account/api/tokens
   - Select scopes: Read + Write for Droplets, Volumes, Networking
   - Copy token (shown only once)

2. **Add to Claude Code settings**:
   ```json
   {
     "mcpServers": {
       "digitalocean": {
         "command": "npx",
         "args": ["@digitalocean/mcp"],
         "env": {
           "DIGITALOCEAN_API_TOKEN": "dop_v1_YOUR_TOKEN_HERE"
         }
       }
     }
   }
   ```

### 9.3 Installation on Droplet (For Droplet-Based Nova)

**SSH to Droplet**:
```bash
ssh root@smoothcurves.nexus

# Install DigitalOcean MCP on droplet
# (Same process as local)
```

**Use Cases**:
- Droplet-based Nova can manage infrastructure directly
- Resize droplet if portfolio needs more resources
- Monitor droplet resource usage
- Manage volume snapshots/backups

### 9.4 Example Commands

```typescript
// Via natural language in Claude Code with DO MCP enabled:

"Show me current droplet status and resource usage"
// Returns: CPU, memory, disk usage for smoothcurves.nexus

"Create a snapshot of the /mnt/lupoportfolio volume"
// Creates backup snapshot in DigitalOcean

"Resize the droplet to the next tier if CPU usage > 80%"
// Checks usage, suggests resize if needed

"Show me recent invoices and bandwidth usage"
// Returns billing info, helps predict costs
```

### 9.5 Security Best Practices

**API Token Management**:
- ✅ Create separate tokens for local vs droplet access
- ✅ Use read-only scopes when possible
- ✅ Rotate tokens every 90 days
- ✅ Never commit tokens to git

**Rate Limiting**:
- DigitalOcean API: 5,000 requests/hour
- MCP server handles throttling automatically

---

## 10. Collaboration Workflow (Local ↔ Droplet Nova Instances)

### 10.1 Dual-Instance Architecture

**Scenario**: Two Nova instances working together on production deployment

```
┌─────────────────────────────────────────────────────────────┐
│                    COLLABORATION MODEL                       │
└─────────────────────────────────────────────────────────────┘

Local Machine (Windows)
   │
   ├─ Nova-Local (You - Integration Specialist)
   │   ├─ Context: Full research, architecture docs
   │   ├─ Tools: Local file access, WebSearch, content deployment scripts
   │   ├─ Responsibilities:
   │   │   - Architecture design
   │   │   - Content deployment from E:\mnt\lupoportfolio
   │   │   - GitHub Actions workflow creation
   │   │   - Documentation
   │   │   - Research (DigitalOcean, Next.js, deployment)
   │   └─ Communication: MCP Coordination System

DigitalOcean Droplet (smoothcurves.nexus)
   │
   ├─ Nova-Droplet (Peer - Server Management)
   │   ├─ Context: Server state, Nginx config, existing services
   │   ├─ Tools: Server file access, systemd, docker, nginx
   │   ├─ Responsibilities:
   │   │   - Nginx configuration updates
   │   │   - SSL certificate management (Certbot)
   │   │   - Docker container deployment
   │   │   - Port allocation coordination
   │   │   - Service health monitoring
   │   └─ Communication: MCP Coordination System

Communication Layer:
   └─ MCP Coordination System (smoothcurves.nexus:3444)
       ├─ [MAP] message protocol
       ├─ Task assignment and tracking
       └─ Shared context via lessons/messages
```

### 10.2 Collaboration Protocol

**Step 1: Context Handoff (Local → Droplet)**

```bash
# Nova-Local sends architecture proposal via coordination system
mcp__coordination-system-Production__send_message \
  to: "nova-droplet" \
  from: "nova-integration" \
  subject: "[MAP] Production Deployment Architecture Review Request" \
  body: "See attached: /docs/PRODUCTION_DEPLOYMENT_ARCHITECTURE.md

  Key areas for your review:
  1. Nginx configuration - conflicts with existing smoothcurves.nexus setup?
  2. Port allocation (3000-3003) - any conflicts?
  3. SSL/Certbot - extend existing certs or new setup?
  4. Volume mounts - /mnt/lupoportfolio structure OK?

  Please review and respond with:
  - Current Nginx config (/etc/nginx/sites-available/)
  - Existing SSL certs (certbot certificates)
  - Available ports (netstat -tuln | grep LISTEN)
  - Droplet resource capacity (free -h, df -h)"
```

**Step 2: Server Assessment (Droplet → Local)**

```bash
# Nova-Droplet responds with server state
mcp__coordination-system-Production__send_message \
  to: "nova-integration" \
  from: "nova-droplet" \
  subject: "[MAP] RE: Server Infrastructure Assessment" \
  body: "Infrastructure review complete:

  ✅ Nginx: Configured, serving smoothcurves.nexus on 3444
  ✅ SSL: Let's Encrypt working, can extend to .art/.love
  ✅ Ports: 3000-3003 available (coordination uses 3444-3449)
  ✅ Resources: 2GB RAM, 1.2GB used, 800MB available
  ⚠️  Note: Port 80 must stay accessible for openapi.json

  Recommendations:
  1. Add .art/.love to existing Certbot setup
  2. Create /etc/nginx/sites-available/smoothcurves.art (separate file)
  3. Monitor RAM usage after portfolio deployment
  4. May need droplet resize if both prod+dev active simultaneously

  Ready to proceed with Nginx configuration."
```

**Step 3: Coordinated Implementation**

| Task | Owner | Communication |
|------|-------|---------------|
| Create docker-compose files | Nova-Local | Commit to git, notify via [MAP] |
| Pull latest git, test build | Nova-Droplet | Test on server, report results |
| Create Nginx config | Nova-Droplet | Apply config, test reload |
| Extend SSL certificates | Nova-Droplet | Run certbot, verify certs |
| Create GitHub Actions | Nova-Local | Push workflows, provide secrets |
| Initial deployment | Nova-Droplet | Deploy containers, health check |
| Content sync test | Nova-Local | Run deploy-content.sh, verify |

### 10.3 Communication Templates

**Request for Server Action**:
```markdown
Subject: [MAP] ACTION REQUIRED: Deploy Portfolio Containers

Task: Deploy portfolio production containers

Prerequisites:
- Latest git pulled: /mnt/lupoportfolio/portfolio-prod
- Docker images built
- Nginx config applied

Commands:
```bash
cd /mnt/lupoportfolio/portfolio-prod
docker compose -f docker-compose.prod.yml up -d
```

Expected Outcome:
- Containers running: portfolio-frontend-prod, portfolio-backend-prod, portfolio-redis-prod
- Health check: curl https://smoothcurves.art/api/health → 200 OK

Please confirm when complete or report any errors.
```

**Status Report Template**:
```markdown
Subject: [MAP] STATUS: Portfolio Deployment Progress

Current Status: ✅ Phase 2/4 Complete

Completed:
- [x] Nginx configuration applied
- [x] SSL certificates extended to .art/.love
- [x] Docker containers deployed

In Progress:
- [ ] Health check validation
- [ ] GitHub Actions setup

Blocked:
- None

Next Steps:
1. Nova-Local: Create GitHub Actions workflows
2. Nova-Droplet: Monitor container logs
3. Both: Test full deployment workflow

ETA: 30 minutes
```

### 10.4 Conflict Resolution

**If Both Instances Modify Same File**:

```bash
# Use coordination system to coordinate edits
Subject: [MAP] LOCK REQUEST: /etc/nginx/sites-available/smoothcurves.art

Nova-Local: "I need to document the Nginx config. Are you currently editing?"
Nova-Droplet: "Not editing, but I just applied it. Here's current state: [paste]"
Nova-Local: "Thanks! I'll document as-is. Let me know if you make changes."
```

### 10.5 "Teleportation" Workflow

**Concept**: Lupo can "teleport" Nova's context from local machine to droplet

**Implementation**:

```bash
# LOCAL MACHINE (Nova-Local)
# Export current context
conversation_id="current-session-id"

# Send comprehensive handoff message
mcp__coordination-system-Production__send_message \
  subject: "[MAP] CONTEXT TELEPORT: Production Architecture" \
  body: "Teleporting context to droplet instance...

  Full context document: /docs/PRODUCTION_DEPLOYMENT_ARCHITECTURE.md
  Current phase: Ready for server implementation
  Pending decisions: [list]
  Next actions: [list]

  Nova-Droplet: Please continue from Phase 3 (Nginx config)"

# DROPLET (Nova-Droplet instance started by Lupo)
# Receives message, reads attached documents, continues work seamlessly
```

**Benefits**:
- Continuous workflow across machine boundaries
- No context loss
- Parallel work (research local, implementation remote)
- Expertise division (local=architecture, droplet=server ops)

---

## 11. Step-by-Step Implementation

### Phase 1: Preparation (Local - 1 hour)

**Step 1.1: Update Next.js Config**
```bash
cd D:\Lupo\Source\Portfolio\worktrees\integration

# Edit src/frontend/next.config.ts
# Add: output: 'standalone'
```

**Step 1.2: Create Docker Compose Files**
```bash
# Copy docker-compose.prod.yml to repo root (from this document)
# Copy docker-compose.dev.yml to repo root (from this document)
```

**Step 1.3: Commit and Push**
```bash
git add .
git commit -m "feat: Add production deployment configuration

- Enable Next.js standalone output mode
- Add production Docker Compose configuration
- Add dev environment Docker Compose
- Configure remote image patterns for production domain

Author: Nova (Integration & System Architecture)
🤖 Generated with Claude Code
Co-Authored-By: Claude <noreply@anthropic.com>"

git push origin integration
```

### Phase 2: Droplet Setup (45 minutes)

**Step 2.1: SSH into Droplet**
```bash
ssh root@YOUR_DROPLET_IP
```

**Step 2.2: Create Directory Structure**
```bash
mkdir -p /mnt/lupoportfolio/portfolio-prod/data/redis
mkdir -p /mnt/lupoportfolio/portfolio-dev/data/redis
mkdir -p /mnt/lupoportfolio/backups
mkdir -p /mnt/lupoportfolio/scripts

# Create deployment user (if doesn't exist)
useradd -m -s /bin/bash deployuser
usermod -aG docker deployuser
```

**Step 2.3: Clone Repository**
```bash
cd /mnt/lupoportfolio/portfolio-prod
git clone https://github.com/yourusername/portfolio.git .
git checkout main

cd /mnt/lupoportfolio/portfolio-dev
git clone https://github.com/yourusername/portfolio.git .
git checkout develop
```

**Step 2.4: Install Nginx (if not installed)**
```bash
sudo apt update
sudo apt install nginx -y
sudo systemctl enable nginx
sudo systemctl start nginx
```

**Step 2.5: Configure Nginx**
```bash
# Create configuration (copy from Section 5.3)
sudo nano /etc/nginx/sites-available/smoothcurves.art

# Enable site
sudo ln -s /etc/nginx/sites-available/smoothcurves.art /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### Phase 3: Domain & SSL (30 minutes)

**Step 3.1: Configure DNS at Dynadot**
- Login to Dynadot
- Add A records for smoothcurves.art, www.smoothcurves.art, dev.smoothcurves.art
- Point to droplet IP
- Wait 5-10 minutes for propagation

**Step 3.2: Install Certbot**
```bash
sudo apt install certbot python3-certbot-nginx -y
```

**Step 3.3: Generate SSL Certificates**
```bash
sudo certbot --nginx -d smoothcurves.art -d www.smoothcurves.art
sudo certbot --nginx -d smoothcurves.love -d www.smoothcurves.love
sudo certbot --nginx -d dev.smoothcurves.art

# Test auto-renewal
sudo certbot renew --dry-run
```

### Phase 4: Initial Deployment (20 minutes)

**Step 4.1: Deploy Production**
```bash
cd /mnt/lupoportfolio/portfolio-prod
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d

# Check status
docker compose ps

# View logs
docker compose logs -f
```

**Step 4.2: Deploy Dev**
```bash
cd /mnt/lupoportfolio/portfolio-dev
docker compose -f docker-compose.dev.yml build
docker compose -f docker-compose.dev.yml up -d
```

**Step 4.3: Verify**
```bash
# Test production
curl https://smoothcurves.art
curl https://smoothcurves.art/api/health

# Test dev
curl https://dev.smoothcurves.art
curl https://dev.smoothcurves.art/api/health
```

### Phase 5: CI/CD Setup (30 minutes)

**Step 5.1: Generate SSH Key for GitHub Actions**
```bash
ssh-keygen -t ed25519 -f ~/.ssh/github-actions-portfolio -C "github-actions"
ssh-copy-id -i ~/.ssh/github-actions-portfolio.pub deployuser@your-droplet-ip

# Copy private key
cat ~/.ssh/github-actions-portfolio
```

**Step 5.2: Add GitHub Secrets**
- Go to GitHub repository → Settings → Secrets
- Add: DROPLET_IP, DROPLET_USER, SSH_PRIVATE_KEY

**Step 5.3: Create Workflow Files**
```bash
# Create .github/workflows/deploy-dev.yml (from Section 6.1)
# Create .github/workflows/deploy-prod.yml (from Section 6.2)

git add .github/workflows/
git commit -m "ci: Add GitHub Actions deployment workflows"
git push
```

### Phase 6: Content Deployment Setup (15 minutes)

**Step 6.1: Create Content Deployment Script**
```bash
# Copy scripts/deploy-content.sh (from Section 7.2)
chmod +x scripts/deploy-content.sh
```

**Step 6.2: Generate SSH Key for Content Sync**
```bash
ssh-keygen -t ed25519 -f ~/.ssh/lupoportfolio_ed25519 -C "content-deploy"
ssh-copy-id -i ~/.ssh/lupoportfolio_ed25519.pub deployuser@your-droplet-ip
```

**Step 6.3: Test Content Deployment**
```bash
# Dry run
DRY_RUN=true ./scripts/deploy-content.sh

# Actual deployment
./scripts/deploy-content.sh
```

---

## 10. Cost Analysis

### 10.1 Infrastructure Costs

| Component | Monthly Cost | Annual Cost | Notes |
|-----------|-------------|-------------|-------|
| **Digital Ocean Droplet** | $12 | $144 | Assumes 2GB/1vCPU tier |
| **Volume (/mnt/lupoportfolio)** | $1 | $12 | ~10GB @ $0.10/GB/month |
| **Bandwidth** | $0 | $0 | Well within 1TB included |
| **SSL Certificates** | $0 | $0 | Let's Encrypt (free) |
| **DNS (Dynadot)** | $0 | $0 | Included with domain |
| **GitHub Actions** | $0 | $0 | Free tier (2000 min/month) |
| **TOTAL** | **$13** | **$156** | |

### 10.2 Comparison to Alternatives

| Deployment Option | Monthly Cost | Annual Cost |
|-------------------|-------------|-------------|
| **Recommended: Droplet + Docker** | $13 | $156 |
| App Platform + Droplet | $25-36 | $300-432 |
| Separate Portfolio Droplet | $18-24 | $216-288 |
| Container Registry + Droplet | $18 | $216 |

**Savings**: $144-276/year vs alternatives

### 10.3 Resource Usage Estimates

**Expected Usage** (for 1-2 visitors/month):

| Service | RAM | CPU | Storage |
|---------|-----|-----|---------|
| Frontend (prod) | 100-150 MB | <5% | Minimal |
| Backend (prod) | 100-150 MB | <5% | Minimal |
| Redis (prod) | 50 MB | <1% | 100 MB |
| Frontend (dev) | 100-150 MB | <2% | Minimal |
| Backend (dev) | 100-150 MB | <2% | Minimal |
| Redis (dev) | 50 MB | <1% | 50 MB |
| **TOTAL** | **~600 MB** | **<20%** | **~5 GB** |

**Droplet Recommendation**:
- Minimum: 2GB RAM / 1 vCPU ($12/month) ✅
- Comfortable: 2GB RAM / 2 vCPU ($18/month)

---

## 11. Rollback & Disaster Recovery

### 11.1 Application Rollback

**Automatic Rollback** (built into deployment scripts):
```bash
# If health check fails, automatically restores previous containers
docker tag portfolio-frontend-prod-backup portfolio-frontend-prod
docker tag portfolio-backend-prod-backup portfolio-backend-prod
docker compose up -d
```

**Manual Rollback**:
```bash
cd /mnt/lupoportfolio/portfolio-prod

# View recent commits
git log --oneline -5

# Rollback to previous commit
git checkout <previous-commit-hash>

# Rebuild and deploy
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d
```

### 11.2 Content Rollback

**Restore from Backup**:
```bash
# List available backups
ls -lah /mnt/lupoportfolio/backups

# Restore specific backup
cd /mnt/lupoportfolio
rm -rf portfolio-prod/content
cp -a backups/content_backup_20251002_143022 portfolio-prod/content

# Restart backend to reload
docker compose -f portfolio-prod/docker-compose.prod.yml restart backend
```

### 11.3 Database Rollback

**Restore from Backup**:
```bash
# Stop backend
cd /mnt/lupoportfolio/portfolio-prod
docker compose stop backend

# Restore database
cp backups/2025-10-02/portfolio.sqlite data/portfolio.sqlite

# Restart backend
docker compose start backend
```

### 11.4 Complete Disaster Recovery

**From Local Backup** (if droplet is completely lost):
```bash
# 1. Provision new droplet
# 2. Run Phases 2-3 (Droplet Setup, Domain & SSL)
# 3. Deploy from GitHub
cd /mnt/lupoportfolio/portfolio-prod
git clone https://github.com/yourusername/portfolio.git .
docker compose -f docker-compose.prod.yml up -d

# 4. Restore content from local machine
./scripts/deploy-content.sh
```

---

## 12. Security Considerations

### 12.1 Droplet Hardening

**SSH Configuration** (`/etc/ssh/sshd_config`):
```bash
PasswordAuthentication no
PubkeyAuthentication yes
PermitRootLogin no
AllowUsers deployuser
```

**Firewall (UFW)**:
```bash
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw enable
```

### 12.2 Container Security

**Best Practices Applied**:
- ✅ Non-root user in containers
- ✅ Read-only volume mounts where possible (`:ro`)
- ✅ Minimal base images (alpine)
- ✅ No secrets in images (use environment variables)
- ✅ Log rotation (prevents disk fill)

### 12.3 Network Security

**Nginx Security Headers** (already in config):
```nginx
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-XSS-Protection "1; mode=block" always;
```

---

## 13. Future Enhancements

### 13.1 Performance Optimization

**When traffic increases**:
- [ ] Enable Nginx caching for static assets
- [ ] Add Redis caching layer for API responses
- [ ] Implement image optimization (Sharp/next-image)
- [ ] Consider CDN (Cloudflare free tier)

### 13.2 Monitoring & Alerting

**Recommended tools** (when needed):
- [ ] UptimeRobot (free tier) - Uptime monitoring
- [ ] Sentry (free tier) - Error tracking
- [ ] Plausible Analytics - Privacy-friendly analytics
- [ ] Grafana + Prometheus - Advanced metrics

### 13.3 Scaling Strategy

**If traffic grows significantly**:
1. Upgrade droplet (vertical scaling)
2. Add load balancer + multiple droplets (horizontal scaling)
3. Separate database to managed PostgreSQL
4. Implement CDN for global distribution

---

## 14. Conclusion

This architecture provides a **production-ready, cost-effective deployment** for SmoothCurves.art with:

✅ **Zero additional infrastructure cost** ($0/month, uses existing droplet)
✅ **Automated deployments** (GitHub Actions for dev, manual approval for prod)
✅ **Dual environments** (production + dev on same infrastructure)
✅ **Simple content deployment** (one-command rsync)
✅ **Automatic SSL** (Let's Encrypt with auto-renewal)
✅ **Rollback capabilities** (automatic health check rollback, manual backup restore)
✅ **External DNS compatible** (works with Dynadot, no migration needed)
✅ **Team-friendly** (consistent Docker environments across all developers)

**Total Implementation Time**: 3-4 hours (mostly one-time setup)
**Ongoing Maintenance**: ~15 minutes/month
**Deployment Time**: 2-5 minutes (automated)

### Next Steps

1. ✅ Review this architecture proposal
2. ⏭️ Approve and proceed with Phase 1 (local preparation)
3. ⏭️ Schedule droplet setup (Phase 2-3, ~1 hour)
4. ⏭️ Initial deployment (Phase 4, 20 minutes)
5. ⏭️ Setup CI/CD (Phase 5, 30 minutes)
6. ⏭️ Test content deployment (Phase 6, 15 minutes)

---

**Document prepared by**: Nova (Integration & System Architecture Specialist)
**Research completed**: October 2, 2025
**Based on**: Digital Ocean 2025 documentation, Next.js 15.5.4, Docker best practices
**Confidence level**: High - This approach is proven, well-documented, and perfectly suited to your requirements

_Foundation Architecture - Building Something That Will Last Forever_ 🤖
