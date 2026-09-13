#!/bin/bash

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

log() { echo -e "${BLUE}[MessagesChat]${NC} $1"; }
ok() { echo -e "${GREEN}[OK]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
err() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

log "Instalando MessagesChat (modo usuario, sin sudo)..."

read -p "Ingresa el puerto donde correra la app [3033]: " APP_PORT
APP_PORT=${APP_PORT:-3033}

read -p "Ingresa la URL publica (ej: https://messageschat.xubi.org): " PUBLIC_URL
PUBLIC_URL=${PUBLIC_URL:-http://localhost:$APP_PORT}

JWT_SECRET="a_jwt_7hK2pQ9xR4mN6vB3cL8wZ1aY6eJ0oD4fG7hT2qW0Pp9uI3yP8sA1dF5gH3jK6lZ0xC4vB8nM7qW2eR9tY5hP1oP"

PROJECT_DIR="$(pwd)"

log "Usuario actual: $(whoami)"
log "Home: $HOME"
log "Directorio del proyecto: $PROJECT_DIR"

log "Verificando Node.js..."
if ! command -v node &> /dev/null; then
  err "Node.js no esta instalado. Pidele a tu amigo que lo instale."
fi
ok "Node.js $(node -v)"

log "Verificando PM2..."
if ! command -v pm2 &> /dev/null; then
  log "PM2 no esta instalado. Intentando instalar local..."
  if npm install -g pm2 2>/dev/null; then
    ok "PM2 instalado globalmente"
  else
    npm install -g pm2 --prefix="$HOME/.npm-global" || err "No se pudo instalar PM2"
    export PATH="$HOME/.npm-global/bin:$PATH"
    if ! command -v pm2 &> /dev/null; then
      echo 'export PATH="$HOME/.npm-global/bin:$PATH"' >> ~/.bashrc
      err "PM2 instalado en $HOME/.npm-global/bin. Cierra y abre la terminal, o ejecuta: source ~/.bashrc"
    fi
  fi
fi
ok "PM2 $(pm2 -v 2>/dev/null || echo '?')"

log "Verificando si el puerto $APP_PORT esta libre..."
if command -v lsof &> /dev/null && lsof -Pi :$APP_PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
  err "El puerto $APP_PORT esta en uso. Elige otro."
elif command -v ss &> /dev/null && ss -tlnp 2>/dev/null | grep -q ":$APP_PORT "; then
  err "El puerto $APP_PORT esta en uso. Elige otro."
fi
ok "Puerto $APP_PORT libre"

log "Creando directorios..."
mkdir -p data uploads uploads/avatars uploads/temp logs public public/assets

log "Creando .env..."
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

PUBLIC_URL=$PUBLIC_URL
EOF
ok ".env creado"

log "Instalando dependencias Node.js..."
npm install --omit=dev
ok "Dependencias instaladas"

log "Iniciando app con PM2..."
pm2 delete messageschat 2>/dev/null || true
pm2 start ecosystem.config.cjs
pm2 save

log "Esperando 3 segundos..."
sleep 3

log "Verificando que la app responde..."
if curl -s "http://localhost:$APP_PORT/api/health" > /dev/null; then
  ok "App responde correctamente en http://localhost:$APP_PORT"
else
  warn "La app no responde. Revisa: pm2 logs messageschat"
fi

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  MessagesChat instalado${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "Puerto local:  ${BLUE}$APP_PORT${NC}"
echo -e "URL publica:   ${BLUE}$PUBLIC_URL${NC}"
echo -e "Directorio:    ${BLUE}$PROJECT_DIR${NC}"
echo -e "Usuario:       ${BLUE}$(whoami)${NC}"
echo ""
echo -e "Comandos utiles:"
echo -e "  ${YELLOW}pm2 status${NC}                     - Ver estado"
echo -e "  ${YELLOW}pm2 logs messageschat${NC}          - Ver logs"
echo -e "  ${YELLOW}pm2 restart messageschat${NC}       - Reiniciar"
echo -e "  ${YELLOW}pm2 stop messageschat${NC}          - Detener"
echo ""
echo -e "${YELLOW}IMPORTANTE:${NC} Pidele a tu amigo que configure nginx:"
echo -e "  proxy_pass http://127.0.0.1:$APP_PORT;"
echo -e "  server_name messageschat.xubi.org;"
echo ""
echo -e "${GREEN}Listo.${NC}"