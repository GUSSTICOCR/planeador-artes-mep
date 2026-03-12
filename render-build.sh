#!/usr/bin/env bash
# exit on error
set -o errexit

npm install

# Instala Chrome directamente en el sistema de Render usando sus herramientas
echo "Descargando Chrome y sus dependencias de sistema para Render..."
npx puppeteer browsers install chrome --path /opt/render/project/src/.cache/puppeteer
