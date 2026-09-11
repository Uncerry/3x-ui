#!/bin/bash
# =============================================================
#  3x-ui - VPS Setup Script
#  Çalıştır: bash vps-setup.sh
# =============================================================

set -e

REPO_URL="https://github.com/Uncerry/3x-ui.git"   # <-- buraya kendi repo URL'ini yaz
INSTALL_DIR="/root/3x-ui"
GO_VERSION="1.23.4"

echo "============================================================"
echo " 3x-ui VPS Kurulum Scripti"
echo "============================================================"

# ---------- 1. Sistem paketleri ----------
echo ""
echo "[1/4] Sistem paketleri kuruluyor..."
apt update -qq
apt install -y git gcc build-essential curl

# ---------- 2. Go kur ----------
if ! command -v go &>/dev/null; then
    echo ""
    echo "[2/4] Go ${GO_VERSION} kuruluyor..."
    wget -q "https://go.dev/dl/go${GO_VERSION}.linux-amd64.tar.gz" -O /tmp/go.tar.gz
    rm -rf /usr/local/go
    tar -C /usr/local -xzf /tmp/go.tar.gz
    rm /tmp/go.tar.gz
    echo 'export PATH=$PATH:/usr/local/go/bin' >> ~/.bashrc
    export PATH=$PATH:/usr/local/go/bin
    echo "    Go kuruldu: $(go version)"
else
    export PATH=$PATH:/usr/local/go/bin
    echo "[2/4] Go zaten kurulu: $(go version)"
fi

# ---------- 3. Node.js kur ----------
if ! command -v node &>/dev/null; then
    echo ""
    echo "[3/4] Node.js kuruluyor..."
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash - 2>/dev/null
    apt install -y nodejs
    echo "    Node.js kuruldu: $(node -v)"
else
    echo "[3/4] Node.js zaten kurulu: $(node -v)"
fi

# ---------- 4. Repo klonla ----------
echo ""
echo "[4/4] Repo klonlanıyor: ${REPO_URL}"
if [ -d "$INSTALL_DIR" ]; then
    echo "    Klasör zaten var, güncelleniyor..."
    cd "$INSTALL_DIR" && git pull
else
    git clone "$REPO_URL" "$INSTALL_DIR"
fi

echo ""
echo "============================================================"
echo " Kurulum tamamlandı!"
echo " Şimdi build almak için şunu çalıştır:"
echo "   bash ${INSTALL_DIR}/deploy/vps-build.sh"
echo "============================================================"
