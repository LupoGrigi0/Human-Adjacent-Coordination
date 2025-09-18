#!/bin/bash

# Production Deployment Script for MCP Coordination System
#
# Deploys source code from development environment to production
# while preserving production data isolation.
#
# @author claude-code-ProductionMCP-DigitalOcean-2025-09-17

set -e  # Exit on any error

# Configuration
DEV_DIR="/mnt/coordinaton_mcp_data/Human-Adjacent-Coordination"
PROD_DIR="/mnt/coordinaton_mcp_data/production"
PROD_DATA_DIR="/mnt/coordinaton_mcp_data/production-data"
BACKUP_DIR="/mnt/coordinaton_mcp_data/production-backups"
DATA_BACKUP_DIR="/mnt/coordinaton_mcp_data/production-data-backups"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Check if we're in the development directory
if [[ ! -f "$DEV_DIR/scripts/deploy-to-production.sh" ]]; then
    error "Must be run from the development environment"
    exit 1
fi

# Verify production server is running before deployment
check_production_server() {
    log "Checking if production server is running..."

    if pgrep -f "production.*streamable-http-server.js" > /dev/null; then
        warning "Production server is running - will need restart after deployment"
        RESTART_NEEDED=true
    else
        log "Production server is not running"
        RESTART_NEEDED=false
    fi
}

# Create production directories if they don't exist
setup_production_structure() {
    log "Setting up production directory structure..."

    # Create main production directories
    mkdir -p "$PROD_DIR"
    mkdir -p "$PROD_DATA_DIR"
    mkdir -p "$BACKUP_DIR"

    # Create production data subdirectories
    mkdir -p "$PROD_DATA_DIR/messages/instances"
    mkdir -p "$PROD_DATA_DIR/messages/projects"
    mkdir -p "$PROD_DATA_DIR/messages/archive"
    mkdir -p "$PROD_DATA_DIR/archive"
    mkdir -p "$PROD_DATA_DIR/lessons"
    mkdir -p "$PROD_DATA_DIR/backups"

    success "Production directory structure created"
}

# Backup current production code (if exists)
backup_production() {
    if [[ -d "$PROD_DIR/src" ]]; then
        log "Backing up current production deployment..."

        BACKUP_TIMESTAMP=$(date '+%Y%m%d_%H%M%S')
        BACKUP_PATH="$BACKUP_DIR/production_backup_$BACKUP_TIMESTAMP"

        cp -r "$PROD_DIR" "$BACKUP_PATH"
        success "Production code backed up to: $BACKUP_PATH"

        # Keep only last 5 backups
        ls -dt "$BACKUP_DIR"/production_backup_* | tail -n +6 | xargs rm -rf 2>/dev/null || true
    else
        log "No existing production deployment to backup"
    fi
}

# Backup production data (always, before any changes)
backup_production_data() {
    if [[ -d "$PROD_DATA_DIR" ]]; then
        log "Backing up production data..."

        BACKUP_TIMESTAMP=$(date '+%Y%m%d_%H%M%S')
        DATA_BACKUP_PATH="$DATA_BACKUP_DIR/production_data_$BACKUP_TIMESTAMP.tar.gz"

        # Create backup directory
        mkdir -p "$DATA_BACKUP_DIR"

        # Create compressed tar archive of production data
        tar -czf "$DATA_BACKUP_PATH" -C "$(dirname "$PROD_DATA_DIR")" "$(basename "$PROD_DATA_DIR")"

        # Get backup size for reporting
        BACKUP_SIZE=$(du -h "$DATA_BACKUP_PATH" | cut -f1)

        success "Production data backed up to: $DATA_BACKUP_PATH ($BACKUP_SIZE)"

        # Keep only last 10 data backups (data is more critical than code)
        ls -dt "$DATA_BACKUP_DIR"/production_data_*.tar.gz | tail -n +11 | xargs rm -f 2>/dev/null || true

        # List current backups
        log "Available data backups:"
        ls -lah "$DATA_BACKUP_DIR"/production_data_*.tar.gz 2>/dev/null | tail -5 || log "No previous data backups found"
    else
        warning "No production data directory found to backup"
    fi
}

# Deploy source code
deploy_source() {
    log "Deploying source code to production..."

    # Copy source directories
    cp -r "$DEV_DIR/src" "$PROD_DIR/"
    cp -r "$DEV_DIR/web-ui" "$PROD_DIR/"
    cp -r "$DEV_DIR/scripts" "$PROD_DIR/"
    cp -r "$DEV_DIR/docs" "$PROD_DIR/"
    cp -r "$DEV_DIR/config" "$PROD_DIR/"

    # Copy essential files
    cp "$DEV_DIR/package.json" "$PROD_DIR/" 2>/dev/null || true
    cp "$DEV_DIR/README.md" "$PROD_DIR/" 2>/dev/null || true

    success "Source code deployed to production"
}

# Deploy system configuration (nginx, systemd)
deploy_system_config() {
    log "Deploying system configuration..."

    # Deploy nginx configuration
    if [[ -f "$PROD_DIR/config/nginx/smoothcurves-nexus" ]]; then
        log "Updating nginx configuration..."

        # Backup current nginx config
        if [[ -f "/etc/nginx/sites-enabled/smoothcurves-nexus" ]]; then
            cp "/etc/nginx/sites-enabled/smoothcurves-nexus" "/etc/nginx/sites-enabled/smoothcurves-nexus.backup.$(date +%Y%m%d_%H%M%S)" 2>/dev/null || true
        fi

        # Copy new nginx config
        cp "$PROD_DIR/config/nginx/smoothcurves-nexus" "/etc/nginx/sites-available/"
        ln -sf "/etc/nginx/sites-available/smoothcurves-nexus" "/etc/nginx/sites-enabled/"

        # Test nginx configuration
        if nginx -t 2>/dev/null; then
            systemctl reload nginx || warning "Failed to reload nginx - manual restart may be needed"
            success "nginx configuration updated"
        else
            error "nginx configuration test failed - restoring backup"
            if [[ -f "/etc/nginx/sites-enabled/smoothcurves-nexus.backup.$(date +%Y%m%d_%H%M%S)" ]]; then
                cp "/etc/nginx/sites-enabled/smoothcurves-nexus.backup.$(date +%Y%m%d_%H%M%S)" "/etc/nginx/sites-enabled/smoothcurves-nexus"
            fi
            return 1
        fi
    fi

    # Deploy systemd service (only if not already exists)
    if [[ -f "$PROD_DIR/config/systemd/mcp-coordination.service" ]] && [[ ! -f "/etc/systemd/system/mcp-coordination.service" ]]; then
        log "Installing systemd service..."
        cp "$PROD_DIR/config/systemd/mcp-coordination.service" "/etc/systemd/system/"
        systemctl daemon-reload
        systemctl enable mcp-coordination.service
        success "systemd service installed"
    fi

    success "System configuration deployed"
}

# Update production configuration
update_production_config() {
    log "Updating production configuration..."

    # Update streamable-http-server.js to use production data directory
    sed -i "s|join(__dirname, '..', 'data')|'$PROD_DATA_DIR'|g" "$PROD_DIR/src/streamable-http-server.js"

    # Update any other data path references
    find "$PROD_DIR/src" -name "*.js" -exec sed -i "s|/mnt/coordinaton_mcp_data/Human-Adjacent-Coordination/data|$PROD_DATA_DIR|g" {} \;

    success "Production configuration updated"
}

# Migrate current production data (first deployment only)
migrate_production_data() {
    if [[ ! -f "$PROD_DATA_DIR/instances.json" ]] && [[ -f "$DEV_DIR/data/instances.json" ]]; then
        log "First deployment - migrating current production data..."

        # Copy current production data to production data directory
        cp -r "$DEV_DIR/data"/* "$PROD_DATA_DIR/"

        # Clear development data but preserve structure
        rm -rf "$DEV_DIR/data/messages/instances"/*
        rm -rf "$DEV_DIR/data/messages/projects"/*
        mkdir -p "$DEV_DIR/data/messages/instances"
        mkdir -p "$DEV_DIR/data/messages/projects"

        # Reset development instances to empty
        echo '{"schema_version": "1.0", "created": "'$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)'", "last_updated": "'$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)'", "instances": []}' > "$DEV_DIR/data/instances.json"

        success "Production data migrated and development environment reset"
    else
        log "Production data already exists - skipping migration"
    fi
}

# Restart production server if needed
restart_production_server() {
    if [[ "$RESTART_NEEDED" == "true" ]]; then
        log "Restarting production server..."

        # Kill existing production server
        pkill -f "production.*streamable-http-server.js" || true
        sleep 2

        # Start new production server
        cd "$PROD_DIR"
        NODE_ENV=production nohup node src/streamable-http-server.js > /dev/null 2>&1 &

        # Wait a moment and check if it started
        sleep 3
        if pgrep -f "production.*streamable-http-server.js" > /dev/null; then
            success "Production server restarted successfully"
        else
            error "Failed to restart production server"
            return 1
        fi
    fi
}

# Validate deployment
validate_deployment() {
    log "Validating deployment..."

    # Check if production files exist
    if [[ ! -f "$PROD_DIR/src/streamable-http-server.js" ]]; then
        error "Production deployment validation failed - missing server file"
        return 1
    fi

    # Check if production data directory is accessible
    if [[ ! -d "$PROD_DATA_DIR" ]]; then
        error "Production data directory not accessible"
        return 1
    fi

    # Test production server health (if running)
    if pgrep -f "production.*streamable-http-server.js" > /dev/null; then
        sleep 2
        if curl -s https://localhost:3444/health > /dev/null; then
            success "Production server health check passed"
        else
            warning "Production server running but health check failed"
        fi
    fi

    success "Deployment validation completed"
}

# Main deployment flow
main() {
    log "Starting production deployment..."
    log "Development: $DEV_DIR"
    log "Production: $PROD_DIR"
    log "Production Data: $PROD_DATA_DIR"

    # Pre-deployment checks
    check_production_server

    # Setup and backup
    setup_production_structure
    backup_production_data  # Backup data FIRST (most critical)
    backup_production       # Then backup code

    # Deploy
    deploy_source
    deploy_system_config    # Deploy nginx and systemd configs
    update_production_config
    migrate_production_data

    # Post-deployment
    restart_production_server
    validate_deployment

    success "🚀 Production deployment completed successfully!"
    log "Production server: https://smoothcurves.nexus"
    log "Production data: $PROD_DATA_DIR"
    log "Backups: $BACKUP_DIR"
}

# Restore production data from backup
restore_production_data() {
    if [[ -z "$1" ]]; then
        error "Usage: restore_production_data <backup_filename>"
        log "Available backups:"
        ls -lah "$DATA_BACKUP_DIR"/production_data_*.tar.gz 2>/dev/null || log "No data backups found"
        return 1
    fi

    local backup_file="$DATA_BACKUP_DIR/$1"
    if [[ ! -f "$backup_file" ]]; then
        backup_file="$1"  # Allow full path
        if [[ ! -f "$backup_file" ]]; then
            error "Backup file not found: $1"
            return 1
        fi
    fi

    log "Restoring production data from: $backup_file"

    # Backup current data before restore
    backup_production_data

    # Remove current production data
    rm -rf "$PROD_DATA_DIR"

    # Extract backup
    tar -xzf "$backup_file" -C "$(dirname "$PROD_DATA_DIR")"

    success "Production data restored from: $backup_file"
    log "Production server restart recommended"
}

# CLI command handling
case "$1" in
    --restore-data)
        restore_production_data "$2"
        exit $?
        ;;
    --list-backups)
        log "Available data backups:"
        ls -lah "$DATA_BACKUP_DIR"/production_data_*.tar.gz 2>/dev/null || log "No data backups found"
        exit 0
        ;;
    --backup-data-only)
        setup_production_structure
        backup_production_data
        exit 0
        ;;
    --help|-h)
        echo "🚀 Production Deployment & Data Management Script"
        echo ""
        echo "Usage:"
        echo "  $0                          # Deploy code to production"
        echo "  $0 --backup-data-only       # Backup production data only"
        echo "  $0 --restore-data <file>    # Restore production data from backup"
        echo "  $0 --list-backups           # List available data backups"
        echo "  $0 --help                   # Show this help"
        echo ""
        echo "Examples:"
        echo "  $0 --restore-data production_data_20250918_063000.tar.gz"
        echo "  $0 --backup-data-only"
        exit 0
        ;;
esac

# Handle interruption
trap 'error "Deployment interrupted"; exit 1' INT TERM

# Run main deployment
main "$@"