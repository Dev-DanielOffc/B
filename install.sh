#!/bin/bash

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() { echo -e "${BLUE}[MessagesChat]${NC} $1"; }
ok() { echo -e "${GREEN}[OK]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
err() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

if [ "$EUID" -ne 0 ]; then
  err "Ejecuta este script como root: sudo bash install.sh"
fi

log "Iniciando instalacion de MessagesChat..."

read -p "Ingresa el dominio (ej: midominio.com): " DOMAIN
if [ -z "$DOMAIN" ]; then
  err "El dominio es obligatorio"
fi

read -p "Ingresa tu email (para Let's Encrypt): " EMAIL
if [ -z "$EMAIL" ]; then
  err "El email es obligatorio"
fi

read -p "Puerto interno para la app [3033]: " APP_PORT
APP_PORT=${APP_PORT:-3033}

read -p "Usuario del sistema para correr la app [www-data]: " APP_USER
APP_USER=${APP_USER:-www-data}

JWT_SECRET="a_jwt_7hK2pQ9xR4mN6vB3cL8wZ1aY6eJ0oD4fG7hT2qW0Pp9uI3yP8sA1dF5gH3jK6lZ0xC4vB8nM7qW2eR9tY5hP1oP"

PROJECT_DIR="/var/www/messageschat"
CURRENT_DIR="$(pwd)"

log "Actualizando sistema..."
apt-get update -y
apt-get upgrade -y

log "Instalando dependencias base..."
apt-get install -y curl wget git build-essential nginx certbot python3-certbot-nginx ufw rsync

log "Verificando puertos en uso..."
if lsof -Pi :80 -sTCP:LISTEN -t >/dev/null 2>&1; then
  warn "El puerto 80 esta en uso. Deteniendo servicios conflictivos..."
  systemctl stop apache2 2>/dev/null || true
  systemctl disable apache2 2>/dev/null || true
fi

log "Instalando Node.js 20..."
if ! command -v node &> /dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
ok "Node.js $(node -v) instalado"

log "Instalando PM2..."
if ! command -v pm2 &> /dev/null; then
  npm install -g pm2
fi
ok "PM2 $(pm2 -v) instalado"

log "Creando directorio del proyecto en $PROJECT_DIR..."
mkdir -p "$PROJECT_DIR"

log "Copiando archivos..."
if command -v rsync &> /dev/null; then
  rsync -a --exclude='node_modules' --exclude='.git' --exclude='data' --exclude='uploads' --exclude='logs' "$CURRENT_DIR/" "$PROJECT_DIR/"
else
  cp -r "$CURRENT_DIR/." "$PROJECT_DIR/"
  rm -rf "$PROJECT_DIR/node_modules" "$PROJECT_DIR/.git" "$PROJECT_DIR/data" "$PROJECT_DIR/uploads" "$PROJECT_DIR/logs"
fi

cd "$PROJECT_DIR"

log "Creando directorios necesarios..."
mkdir -p data uploads uploads/avatars uploads/temp logs public public/assets

log "Creando archivo .env..."
cat > .env <<EOF
PORT=$APP_PORT
HOST=0.0.0.0
NODE_ENV=production

JWT_SECRET=$JWT_SECRET
JWT_EXPIRES_IN=7d

DB_PATH=./data/messageschat.db

PUBLIC_DIR=./public
UPLOAD_DIR=./uploads
UPLOAD_MAX_SIZE=5242880

PUBLIC_URL=https://$DOMAIN
EOF
ok ".env creado"

log "Instalando dependencias Node.js..."
npm install --omit=dev
ok "Dependencias instaladas"

log "Configurando permisos..."
chown -R "$APP_USER":"$APP_USER" "$PROJECT_DIR"
chmod -R 755 "$PROJECT_DIR"
chmod -R 775 "$PROJECT_DIR/data" "$PROJECT_DIR/uploads" "$PROJECT_DIR/logs"

log "Configurando nginx (HTTP solo para validacion)..."
cat > /etc/nginx/sites-available/messageschat <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        proxy_pass http://127.0.0.1:$APP_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 86400;
        proxy_send_timeout 86400;
    }
}
EOF

mkdir -p /var/www/certbot

ln -sf /etc/nginx/sites-available/messageschat /etc/nginx/sites-enabled/messageschat
rm -f /etc/nginx/sites-enabled/default

log "Iniciando app con PM2 antes de nginx..."
cd "$PROJECT_DIR"
sudo -u "$APP_USER" pm2 start ecosystem.config.cjs || err "Error iniciando PM2"
sudo -u "$APP_USER" pm2 save

env PATH=$PATH:/usr/bin pm2 startup systemd -u "$APP_USER" --hp "/home/$APP_USER" || warn "Configura pm2 startup manualmente"

log "Reiniciando nginx..."
nginx -t || err "Error en configuracion de nginx HTTP"
systemctl restart nginx
systemctl enable nginx

log "Esperando a que la app este lista..."
sleep 5

log "Obteniendo certificado SSL..."
if certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$EMAIL" --redirect; then
  ok "Certificado SSL obtenido correctamente"
else
  warn "Certbot fallo. La app funciona en HTTP pero sin SSL."
  warn "Revisa que el dominio $DOMAIN apunte a este servidor."
fi

log "Configurando firewall..."
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  MessagesChat instalado correctamente${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "Dominio:    ${BLUE}https://$DOMAIN${NC}"
echo -e "Puerto:     ${BLUE}$APP_PORT${NC}"
echo -e "Directorio: ${BLUE}$PROJECT_DIR${NC}"
echo -e "Usuario:    ${BLUE}$APP_USER${NC}"
echo ""
echo -e "Comandos utiles:"
echo -e "  ${YELLOW}pm2 status${NC}                     - Ver estado"
echo -e "  ${YELLOW}pm2 logs messageschat${NC}          - Ver logs"
echo -e "  ${YELLOW}pm2 restart messageschat${NC}       - Reiniciar"
echo -e "  ${YELLOW}pm2 stop messageschat${NC}          - Detener"
echo ""
echo -e "${GREEN}Listo. Tu app esta en https://$DOMAIN${NC}"