#!/usr/bin/env bash
# exit on error
set -o errexit

# Descargamos e instalamos las dependencias del sistema operativo que Puppeteer necesita 
# (Render usa Ubuntu Linux por debajo)
echo "Instalando dependencias de SO para Chrome..."
apt-get update || true
apt-get install -y wget gnupg ca-certificates libgconf-2-4 libnss3 libxss1 libasound2 fonts-liberation libappindicator3-1 xdg-utils || true

# Ejecutamos la instalación normal de Node
npm install

# Instalamos explícitamente el navegador en una forma que Puppeteer pueda auto-detectar
npx puppeteer browsers install chrome
