#!/bin/bash
set -e

INSTALL_DIR="/root/3x-ui"
export PATH=$PATH:/usr/local/go/bin

echo "============================================================"
echo " 3x-ui - Build & Çalıştır"
echo "============================================================"

cd "$INSTALL_DIR"

echo ""
echo "[1/4] GitHub'dan son değişiklikler çekiliyor..."
git pull
echo "    Branch: $(git branch --show-current)  Commit: $(git rev-parse --short HEAD)"

echo ""
echo "[2/4] Frontend build ediliyor..."
cd frontend
npm ci --silent
npm run build
cd ..
echo "    Frontend hazır."

echo ""
echo "[3/4] Go binary derleniyor..."
CGO_ENABLED=1 GOOS=linux GOARCH=amd64 \
    go build -ldflags "-w -s" -o build/x-ui main.go
chmod +x build/x-ui
echo "    Binary hazır: build/x-ui"

echo ""
echo "[4/4] x-ui başlatılıyor..."
pkill -f "build/x-ui" 2>/dev/null && echo "    Eski process durduruldu." || true
nohup ./build/x-ui > /var/log/x-ui.log 2>&1 &
echo "    x-ui başlatıldı. (PID: $!)"

echo ""
echo "============================================================"
echo " Tamamlandı!"
echo " Panel: http://$(hostname -I | awk '{print $1}'):2053"
echo " Log:   tail -f /var/log/x-ui.log"
echo "============================================================"
