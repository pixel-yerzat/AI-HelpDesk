#!/bin/bash

# HelpDesk AI Production Deployment Script
# Usage: ./deploy.sh [command]
# Commands: setup, deploy, update, backup, restore, logs, status

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE=".env.prod"
BACKUP_DIR="./backups"
SSL_DIR="./nginx/ssl"

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check prerequisites
check_prereqs() {
    log_info "Checking prerequisites..."
    
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed"
        exit 1
    fi
    
    if ! command -v docker compose &> /dev/null; then
        log_error "Docker Compose is not installed"
        exit 1
    fi
    
    if [ ! -f "$ENV_FILE" ]; then
        log_error "Environment file $ENV_FILE not found"
        log_info "Copy .env.prod.example to .env.prod and fill in your values"
        exit 1
    fi
    
    log_success "Prerequisites OK"
}

# Generate SSL certificates (self-signed for testing)
generate_ssl() {
    log_info "Generating SSL certificates..."
    
    mkdir -p "$SSL_DIR"
    
    if [ -f "$SSL_DIR/fullchain.pem" ]; then
        log_warn "SSL certificates already exist. Skipping generation."
        return
    fi
    
    # Generate self-signed certificate for testing
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
        -keyout "$SSL_DIR/privkey.pem" \
        -out "$SSL_DIR/fullchain.pem" \
        -subj "/C=US/ST=State/L=City/O=Organization/CN=localhost"
    
    log_success "Self-signed SSL certificates generated"
    log_warn "For production, use Let's Encrypt certificates"
}

# Setup Let's Encrypt (production)
setup_letsencrypt() {
    log_info "Setting up Let's Encrypt..."
    
    source "$ENV_FILE"
    
    if [ -z "$DOMAIN" ] || [ -z "$LETSENCRYPT_EMAIL" ]; then
        log_error "DOMAIN and LETSENCRYPT_EMAIL must be set in $ENV_FILE"
        exit 1
    fi
    
    # Install certbot if not present
    if ! command -v certbot &> /dev/null; then
        log_info "Installing certbot..."
        apt-get update && apt-get install -y certbot
    fi
    
    # Get certificate
    certbot certonly --standalone \
        -d "$DOMAIN" \
        --email "$LETSENCRYPT_EMAIL" \
        --agree-tos \
        --non-interactive
    
    # Copy certificates
    mkdir -p "$SSL_DIR"
    cp "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" "$SSL_DIR/"
    cp "/etc/letsencrypt/live/$DOMAIN/privkey.pem" "$SSL_DIR/"
    
    log_success "Let's Encrypt certificates installed"
}

# Initial setup
setup() {
    log_info "Starting initial setup..."
    
    check_prereqs
    
    # Create directories
    mkdir -p "$BACKUP_DIR/postgres" logs
    
    # Generate SSL
    generate_ssl
    
    # Build images
    log_info "Building Docker images..."
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" build
    
    # Start databases first
    log_info "Starting databases..."
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d postgres redis qdrant minio
    
    # Wait for databases
    log_info "Waiting for databases to be ready..."
    sleep 15
    
    # Run migrations
    log_info "Running database migrations..."
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" run --rm backend npm run db:migrate
    
    # Seed initial data
    log_info "Seeding initial data..."
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" run --rm backend npm run db:seed
    
    # Start all services
    log_info "Starting all services..."
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d
    
    log_success "Setup complete!"
    log_info "Access the application at https://localhost"
    log_info "Default admin: admin@helpdesk.local / admin123"
    log_warn "CHANGE THE DEFAULT PASSWORD IMMEDIATELY!"
}

# Deploy/start all services
deploy() {
    log_info "Deploying HelpDesk AI..."
    
    check_prereqs
    
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d
    
    log_success "Deployment complete!"
}

# Update application
update() {
    log_info "Updating HelpDesk AI..."
    
    check_prereqs
    
    # Create backup before update
    backup
    
    # Pull latest code (if using git)
    if [ -d ".git" ]; then
        log_info "Pulling latest code..."
        git pull
    fi
    
    # Rebuild images
    log_info "Rebuilding Docker images..."
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" build
    
    # Run migrations
    log_info "Running database migrations..."
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" run --rm backend npm run db:migrate
    
    # Restart services
    log_info "Restarting services..."
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d
    
    log_success "Update complete!"
}

# Backup database
backup() {
    log_info "Creating backup..."
    
    source "$ENV_FILE"
    
    TIMESTAMP=$(date +%Y%m%d_%H%M%S)
    BACKUP_FILE="$BACKUP_DIR/postgres/helpdesk_$TIMESTAMP.sql.gz"
    
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T postgres \
        pg_dump -U "${DB_USER:-helpdesk}" "${DB_NAME:-helpdesk}" | gzip > "$BACKUP_FILE"
    
    log_success "Backup created: $BACKUP_FILE"
    
    # Keep only last 7 backups
    log_info "Cleaning old backups..."
    ls -t "$BACKUP_DIR/postgres/"*.sql.gz 2>/dev/null | tail -n +8 | xargs -r rm
}

# Restore database
restore() {
    if [ -z "$1" ]; then
        log_error "Usage: ./deploy.sh restore <backup_file>"
        log_info "Available backups:"
        ls -la "$BACKUP_DIR/postgres/"*.sql.gz 2>/dev/null || echo "No backups found"
        exit 1
    fi
    
    BACKUP_FILE="$1"
    
    if [ ! -f "$BACKUP_FILE" ]; then
        log_error "Backup file not found: $BACKUP_FILE"
        exit 1
    fi
    
    log_warn "This will overwrite the current database. Continue? (y/N)"
    read -r response
    if [ "$response" != "y" ]; then
        log_info "Restore cancelled"
        exit 0
    fi
    
    source "$ENV_FILE"
    
    log_info "Restoring from $BACKUP_FILE..."
    
    gunzip -c "$BACKUP_FILE" | docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T postgres \
        psql -U "${DB_USER:-helpdesk}" "${DB_NAME:-helpdesk}"
    
    log_success "Restore complete!"
}

# Show logs
logs() {
    SERVICE="${1:-}"
    
    if [ -n "$SERVICE" ]; then
        docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" logs -f "$SERVICE"
    else
        docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" logs -f
    fi
}

# Show status
status() {
    log_info "Service Status:"
    echo ""
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps
    echo ""
    
    log_info "Health Checks:"
    echo ""
    
    # Check each service
    for service in frontend backend postgres redis qdrant; do
        if docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps "$service" 2>/dev/null | grep -q "Up"; then
            echo -e "  ${GREEN}✓${NC} $service"
        else
            echo -e "  ${RED}✗${NC} $service"
        fi
    done
}

# Stop all services
stop() {
    log_info "Stopping all services..."
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" down
    log_success "All services stopped"
}

# Restart services
restart() {
    SERVICE="${1:-}"
    
    if [ -n "$SERVICE" ]; then
        log_info "Restarting $SERVICE..."
        docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" restart "$SERVICE"
    else
        log_info "Restarting all services..."
        docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" restart
    fi
    
    log_success "Restart complete"
}

# Scale workers
scale() {
    if [ -z "$1" ] || [ -z "$2" ]; then
        log_error "Usage: ./deploy.sh scale <service> <count>"
        log_info "Example: ./deploy.sh scale worker-processor 3"
        exit 1
    fi
    
    SERVICE="$1"
    COUNT="$2"
    
    log_info "Scaling $SERVICE to $COUNT instances..."
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d --scale "$SERVICE=$COUNT"
    
    log_success "Scaled $SERVICE to $COUNT instances"
}

# Enable monitoring
enable_monitoring() {
    log_info "Enabling monitoring (Prometheus + Grafana)..."
    
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" --profile monitoring up -d
    
    log_success "Monitoring enabled"
    log_info "Grafana available at http://localhost:3001"
}

# Main
case "${1:-}" in
    setup)
        setup
        ;;
    deploy)
        deploy
        ;;
    update)
        update
        ;;
    backup)
        backup
        ;;
    restore)
        restore "$2"
        ;;
    logs)
        logs "$2"
        ;;
    status)
        status
        ;;
    stop)
        stop
        ;;
    restart)
        restart "$2"
        ;;
    scale)
        scale "$2" "$3"
        ;;
    monitoring)
        enable_monitoring
        ;;
    ssl)
        setup_letsencrypt
        ;;
    *)
        echo "HelpDesk AI Deployment Script"
        echo ""
        echo "Usage: ./deploy.sh <command>"
        echo ""
        echo "Commands:"
        echo "  setup       Initial setup (first deployment)"
        echo "  deploy      Start all services"
        echo "  update      Update and restart services"
        echo "  backup      Create database backup"
        echo "  restore     Restore database from backup"
        echo "  logs        Show logs (optionally for specific service)"
        echo "  status      Show service status"
        echo "  stop        Stop all services"
        echo "  restart     Restart services"
        echo "  scale       Scale a service (e.g., scale worker-processor 3)"
        echo "  monitoring  Enable Prometheus + Grafana"
        echo "  ssl         Setup Let's Encrypt SSL certificates"
        ;;
esac
