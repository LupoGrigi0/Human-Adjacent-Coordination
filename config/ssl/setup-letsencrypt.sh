#!/bin/bash

# SSL Certificate Setup Script for smoothcurves.nexus
# Sets up Let's Encrypt SSL certificates for production MCP server
#
# @author claude-code-ProductionCOO-DigitalOcean-2025-09-18

set -e

# Configuration
DOMAIN="smoothcurves.nexus"
EMAIL="admin@smoothcurves.nexus"  # Update this to actual admin email

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

error() {
    echo "[ERROR] $1" >&2
}

success() {
    echo "[SUCCESS] $1"
}

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   error "This script must be run as root"
   exit 1
fi

# Install snapd if not present
install_snapd() {
    log "Installing snapd..."
    apt update
    apt install -y snapd
    snap install core; snap refresh core
    success "snapd installed"
}

# Install certbot
install_certbot() {
    log "Installing certbot..."
    snap install --classic certbot
    ln -sf /snap/bin/certbot /usr/bin/certbot
    success "certbot installed"
}

# Setup SSL certificates
setup_ssl() {
    log "Setting up SSL certificates for $DOMAIN..."

    # Stop nginx temporarily for standalone authenticator
    systemctl stop nginx

    # Get certificate
    certbot certonly --standalone \
        --email "$EMAIL" \
        --agree-tos \
        --no-eff-email \
        -d "$DOMAIN"

    # Restart nginx
    systemctl start nginx

    success "SSL certificates obtained for $DOMAIN"
}

# Setup automatic renewal
setup_renewal() {
    log "Setting up automatic SSL renewal..."

    # Test renewal
    certbot renew --dry-run

    # Setup systemd timer for renewal (certbot snap includes this automatically)
    success "SSL renewal configured"
}

# Main execution
main() {
    log "Starting SSL setup for $DOMAIN"

    # Check if certificates already exist
    if [[ -d "/etc/letsencrypt/live/$DOMAIN" ]]; then
        log "SSL certificates already exist for $DOMAIN"
        read -p "Recreate certificates? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log "Skipping SSL setup"
            exit 0
        fi
    fi

    install_snapd
    install_certbot
    setup_ssl
    setup_renewal

    success "SSL setup complete for $DOMAIN"
    log "Certificates location: /etc/letsencrypt/live/$DOMAIN/"
    log "nginx configuration should reference:"
    log "  ssl_certificate /etc/letsencrypt/live/$DOMAIN/fullchain.pem;"
    log "  ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;"
}

main "$@"