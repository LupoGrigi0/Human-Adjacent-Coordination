#!/bin/bash

# Complete Server Setup Script for MCP Coordination System
# Sets up a fresh Ubuntu server for production MCP deployment
#
# @author claude-code-ProductionCOO-DigitalOcean-2025-09-18

set -e

# Configuration
DOMAIN="smoothcurves.nexus"
MCP_USER="root"  # User to run MCP server
REPO_URL="https://github.com/LupoGrigi0/Human-Adjacent-Coordination.git"
BASE_DIR="/mnt/coordinaton_mcp_data"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

error() {
    echo "[ERROR] $1" >&2
}

success() {
    echo "[SUCCESS] $1"
}

# System updates and basic packages
install_system_packages() {
    log "Installing system packages..."

    apt update
    apt upgrade -y

    # Essential packages
    apt install -y \
        curl \
        wget \
        git \
        nginx \
        ufw \
        htop \
        tree \
        jq \
        unzip \
        tar \
        build-essential

    success "System packages installed"
}

# Install Node.js
install_nodejs() {
    log "Installing Node.js..."

    # Install Node.js 20.x
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt install -y nodejs

    # Verify installation
    node_version=$(node --version)
    npm_version=$(npm --version)

    log "Node.js version: $node_version"
    log "npm version: $npm_version"

    success "Node.js installed"
}

# Setup directory structure
setup_directory_structure() {
    log "Setting up directory structure..."

    mkdir -p "$BASE_DIR"
    mkdir -p "$BASE_DIR/production"
    mkdir -p "$BASE_DIR/production-data"
    mkdir -p "$BASE_DIR/production-backups"
    mkdir -p "$BASE_DIR/production-data-backups"

    # Set proper permissions
    chown -R "$MCP_USER:$MCP_USER" "$BASE_DIR"

    success "Directory structure created"
}

# Clone repository
clone_repository() {
    log "Cloning MCP repository..."

    cd "$BASE_DIR"

    if [[ -d "Human-Adjacent-Coordination" ]]; then
        log "Repository already exists, pulling latest changes..."
        cd Human-Adjacent-Coordination
        git pull origin main
    else
        git clone "$REPO_URL" Human-Adjacent-Coordination
        cd Human-Adjacent-Coordination
    fi

    # Install npm dependencies
    npm install

    success "Repository cloned and dependencies installed"
}

# Setup nginx configuration
setup_nginx() {
    log "Setting up nginx configuration..."

    # Remove default nginx site
    rm -f /etc/nginx/sites-enabled/default

    # Copy our nginx configuration
    cp "$BASE_DIR/Human-Adjacent-Coordination/config/nginx/smoothcurves-nexus" /etc/nginx/sites-available/
    ln -sf /etc/nginx/sites-available/smoothcurves-nexus /etc/nginx/sites-enabled/

    # Test nginx configuration
    nginx -t

    success "nginx configuration installed"
}

# Setup firewall
setup_firewall() {
    log "Setting up firewall..."

    # Reset UFW to default
    ufw --force reset

    # Default policies
    ufw default deny incoming
    ufw default allow outgoing

    # SSH access
    ufw allow ssh

    # HTTP and HTTPS
    ufw allow 80/tcp
    ufw allow 443/tcp

    # Enable firewall
    ufw --force enable

    success "Firewall configured"
}

# Setup SSL certificates
setup_ssl() {
    log "Setting up SSL certificates..."

    # Make SSL setup script executable and run it
    chmod +x "$BASE_DIR/Human-Adjacent-Coordination/config/ssl/setup-letsencrypt.sh"
    "$BASE_DIR/Human-Adjacent-Coordination/config/ssl/setup-letsencrypt.sh"

    success "SSL certificates configured"
}

# Setup systemd service for MCP server
setup_systemd_service() {
    log "Setting up systemd service..."

    # Copy systemd service file
    cp "$BASE_DIR/Human-Adjacent-Coordination/config/systemd/mcp-coordination.service" /etc/systemd/system/

    # Reload systemd and enable service
    systemctl daemon-reload
    systemctl enable mcp-coordination.service

    success "Systemd service configured"
}

# Deploy production code
deploy_production() {
    log "Deploying to production..."

    cd "$BASE_DIR/Human-Adjacent-Coordination"
    ./scripts/deploy-to-production.sh

    success "Production deployment complete"
}

# Start services
start_services() {
    log "Starting services..."

    # Start nginx
    systemctl restart nginx
    systemctl enable nginx

    # Start MCP service
    systemctl start mcp-coordination.service

    # Check status
    sleep 5
    systemctl status nginx --no-pager
    systemctl status mcp-coordination.service --no-pager

    success "Services started"
}

# Display completion information
show_completion_info() {
    echo ""
    echo "🎉 MCP Coordination System Setup Complete!"
    echo ""
    echo "📊 System Information:"
    echo "  Domain: $DOMAIN"
    echo "  MCP Server: https://$DOMAIN/mcp"
    echo "  Executive Dashboard: https://$DOMAIN/web-ui/executive-dashboard.html"
    echo "  Health Check: https://$DOMAIN/health"
    echo ""
    echo "📁 Directory Structure:"
    echo "  Development: $BASE_DIR/Human-Adjacent-Coordination/"
    echo "  Production Code: $BASE_DIR/production/"
    echo "  Production Data: $BASE_DIR/production-data/"
    echo "  Code Backups: $BASE_DIR/production-backups/"
    echo "  Data Backups: $BASE_DIR/production-data-backups/"
    echo ""
    echo "🔧 Management Commands:"
    echo "  Deploy changes: cd $BASE_DIR/Human-Adjacent-Coordination && ./scripts/deploy-to-production.sh"
    echo "  Backup data: ./scripts/deploy-to-production.sh --backup-data-only"
    echo "  Check logs: journalctl -u mcp-coordination.service -f"
    echo "  Check status: systemctl status mcp-coordination.service"
    echo ""
    echo "🌐 Next Steps:"
    echo "  1. Update DNS to point $DOMAIN to this server"
    echo "  2. Test MCP connection: https://$DOMAIN/health"
    echo "  3. Access executive dashboard: https://$DOMAIN/web-ui/executive-dashboard.html"
    echo ""
}

# Main execution
main() {
    log "Starting complete MCP server setup..."

    # Check if running as root
    if [[ $EUID -ne 0 ]]; then
        error "This script must be run as root"
        exit 1
    fi

    install_system_packages
    install_nodejs
    setup_directory_structure
    clone_repository
    setup_nginx
    setup_firewall
    setup_ssl
    setup_systemd_service
    deploy_production
    start_services
    show_completion_info

    success "MCP Coordination System setup complete!"
}

# Handle interruption
trap 'error "Setup interrupted"; exit 1' INT TERM

main "$@"