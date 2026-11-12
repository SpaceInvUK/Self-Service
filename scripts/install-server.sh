#!/usr/bin/env bash
# cAssistAI on an online server (Ubuntu 22.04/24.04, e.g. Oracle Cloud Always Free).
# Usage, on the server:
#   curl -fsSL https://raw.githubusercontent.com/SpaceInvUK/Self-Service/claude/amazing-fermi-nrlr4z/scripts/install-server.sh | sudo bash -s -- minhaloja.duckdns.org
# Installs Node.js, the app, HTTPS (Caddy + Let's Encrypt), a service that keeps
# it running, daily backups and automatic updates. Safe to run again.
set -euo pipefail

DOMAIN="${1:-}"
REPO="https://github.com/SpaceInvUK/Self-Service.git"
BRANCH="${CASSIST_BRANCH:-claude/amazing-fermi-nrlr4z}"
APP=/opt/cassistai
DATA=/var/lib/cassistai
BACKUPS=/var/backups/cassistai
USER_NAME=cassist

say() { printf '\n>> %s\n' "$*"; }
[ "$(id -u)" -eq 0 ] || { echo "Rode com sudo."; exit 1; }
[ -n "$DOMAIN" ] || { echo "Informe o endereço: ... | sudo bash -s -- minhaloja.duckdns.org"; exit 1; }
case "$DOMAIN" in *.*) ;; *) echo "Endereço inválido: $DOMAIN"; exit 1 ;; esac

say "Instalando pacotes do sistema"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y ca-certificates curl git gnupg sqlite3 debian-keyring debian-archive-keyring apt-transport-https iptables-persistent

say "Instalando Node.js 24"
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 24 ]; then
  curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
  apt-get install -y nodejs
fi
node -v

say "Instalando Caddy (HTTPS automático)"
if ! command -v caddy >/dev/null; then
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y
  apt-get install -y caddy
fi

say "Liberando as portas 80 e 443 no firewall do servidor"
# Oracle's Ubuntu images block everything but SSH inside the machine too.
for port in 80 443; do
  if ! iptables -C INPUT -p tcp -m state --state NEW --dport "$port" -j ACCEPT 2>/dev/null; then
    reject="$(iptables -L INPUT --line-numbers -n | awk '/REJECT/ {print $1; exit}')"
    if [ -n "$reject" ]; then
      iptables -I INPUT "$reject" -p tcp -m state --state NEW --dport "$port" -j ACCEPT
    else
      iptables -A INPUT -p tcp -m state --state NEW --dport "$port" -j ACCEPT
    fi
  fi
done
netfilter-persistent save

say "Baixando o cAssistAI"
id "$USER_NAME" >/dev/null 2>&1 || useradd --system --home "$DATA" --shell /usr/sbin/nologin "$USER_NAME"
mkdir -p "$DATA" "$BACKUPS"
if [ ! -d "$APP/.git" ]; then
  git clone -q -b "$BRANCH" "$REPO" "$APP"
fi
chown -R "$USER_NAME:$USER_NAME" "$APP" "$DATA"
# Git runs as the app user (the folder belongs to it).
runuser -u "$USER_NAME" -- env HOME="$DATA" git -C "$APP" fetch -q origin "$BRANCH"
runuser -u "$USER_NAME" -- env HOME="$DATA" git -C "$APP" checkout -q -B "$BRANCH" "origin/$BRANCH"
chmod 700 "$DATA"

say "Configurando"
ENV="$APP/.env"
if [ ! -f "$ENV" ]; then
  TOKEN="$(openssl rand -hex 12)"
  KEY=""
  if [ -r /dev/tty ]; then
    printf '\nChave do Groq (crie grátis em https://console.groq.com/keys).\nCole e aperte Enter, ou só Enter para configurar depois: '
    read -r KEY </dev/tty || KEY=""
  fi
  cat >"$ENV" <<EOF
# cAssistAI online. Edite com: sudo nano $ENV  e depois: sudo systemctl restart cassistai
HOST=127.0.0.1
PORT=3000
DATA_DIR=$DATA
PUBLIC_URL=https://$DOMAIN
COOKIE_SECURE=true
TRUST_PROXY=true
SETUP_TOKEN=$TOKEN
LOCAL_CONNECTORS=true
AI_BASE_URL=https://api.groq.com/openai/v1
AI_MODEL=auto
AI_API_KEY=$KEY
AUDIO_MAX_SECONDS=600
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
EOF
fi
chown "$USER_NAME:$USER_NAME" "$ENV"
chmod 600 "$ENV"

say "Instalando componentes e montando o painel"
run_as() { runuser -u "$USER_NAME" -- env HOME="$DATA" "$@"; }
build() {
  cd "$APP"
  run_as npm ci --omit=dev --no-audit --no-fund
  (cd connector && run_as npm ci --omit=dev --no-audit --no-fund)
  run_as npm run build
}
build

say "Criando o serviço que mantém o app sempre ligado"
cat >/etc/systemd/system/cassistai.service <<EOF
[Unit]
Description=cAssistAI
After=network-online.target
Wants=network-online.target

[Service]
User=$USER_NAME
WorkingDirectory=$APP
ExecStart=/usr/bin/node --disable-warning=ExperimentalWarning --env-file=$ENV server/start.mjs
Restart=always
RestartSec=5
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
EOF

say "Configurando o HTTPS para $DOMAIN"
cat >/etc/caddy/Caddyfile <<EOF
$DOMAIN {
  encode gzip
  reverse_proxy 127.0.0.1:3000
}
EOF

say "Cópia de segurança diária (guarda 14 dias) e atualização automática"
cat >/usr/local/bin/cassistai-backup <<EOF
#!/usr/bin/env bash
set -e
sqlite3 "$DATA/cassistai.sqlite" ".backup '$BACKUPS/cassistai-\$(date +%F).sqlite'"
tar -czf "$BACKUPS/whatsapp-\$(date +%F).tgz" -C "$DATA" whatsapp local-connectors.json 2>/dev/null || true
find "$BACKUPS" -type f -mtime +14 -delete
EOF
cat >/usr/local/bin/cassistai-update <<EOF
#!/usr/bin/env bash
# Updates from GitHub when there is a new version, then restarts the app.
set -e
cd "$APP"
g() { runuser -u $USER_NAME -- env HOME="$DATA" git "\$@"; }
g fetch -q origin "$BRANCH"
[ "\$(g rev-parse HEAD)" = "\$(g rev-parse "origin/$BRANCH")" ] && exit 0
/usr/local/bin/cassistai-backup
g checkout -q -B "$BRANCH" "origin/$BRANCH"
runuser -u $USER_NAME -- env HOME="$DATA" npm ci --omit=dev --no-audit --no-fund
(cd connector && runuser -u $USER_NAME -- env HOME="$DATA" npm ci --omit=dev --no-audit --no-fund)
runuser -u $USER_NAME -- env HOME="$DATA" npm run build
systemctl restart cassistai
echo "cAssistAI atualizado para \$(g rev-parse --short HEAD)"
EOF
chmod 755 /usr/local/bin/cassistai-backup /usr/local/bin/cassistai-update
cat >/etc/cron.d/cassistai <<EOF
# Backup every day at 03:17; check for updates every 30 minutes.
17 3 * * * root /usr/local/bin/cassistai-backup
*/30 * * * * root /usr/local/bin/cassistai-update >>/var/log/cassistai-update.log 2>&1
EOF

systemctl daemon-reload
systemctl enable --now cassistai
systemctl restart cassistai
systemctl reload caddy || systemctl restart caddy

say "Conferindo"
for i in $(seq 1 30); do
  curl -fsS http://127.0.0.1:3000/api/health >/dev/null 2>&1 && break
  sleep 2
done
curl -fsS http://127.0.0.1:3000/api/health >/dev/null && echo "App: ligado" || echo "App: NÃO respondeu (veja: sudo journalctl -u cassistai -n 50)"

TOKEN_NOW="$(grep '^SETUP_TOKEN=' "$ENV" | cut -d= -f2)"
cat <<EOF

==================================================
  cAssistAI instalado.
  Abra:  https://$DOMAIN
  (o cadeado pode levar 1-2 minutos na primeira vez)

  Código de instalação (pedido ao criar a conta):
  $TOKEN_NOW

  Configuração:  sudo nano $ENV
  Reiniciar:     sudo systemctl restart cassistai
  Ver o que ele está fazendo:  sudo journalctl -u cassistai -f
==================================================
EOF
