# 🚀 Paso Final: Poner tu Web en Internet con Render

Ahora que tus archivos están en GitHub, vamos a darles vida con un link real.

## 1. Actualizar el Servidor
He realizado un pequeño ajuste técnico en `server.js` para que funcione en la nube.
1.  Vuelve a la página de tu repositorio en GitHub.
2.  Haz clic en el botón **"Add file"** -> **"Upload files"**.
3.  Arrastra **SOLO** el archivo `server.js` de tu carpeta actual.
4.  Dale a **"Commit changes"**. Esto es vital para que la nube sepa cómo arrancar.

## 2. Crear cuenta en Render
1.  Ve a [render.com](https://render.com/).
2.  Regístrate usando tu cuenta de **GitHub** (es lo más rápido).

## 3. Conectar tu Proyecto
1.  En el Dashboard de Render, haz clic en el botón azul **"New +"** y selecciona **"Web Service"**.
2.  Verás una lista de tus repositorios de GitHub. Busca `planeador-artes-mep` y haz clic en **"Connect"**.

## 4. Configuración (Casi listo)
Render detectará todo automáticamente, pero verifica esto:
-   **Runtime**: `Node`.
-   **Build Command**: `npm install`.
-   **Start Command**: `node server.js` (o `npm start`).
-   **Instance Type**: Selecciona el plan **Free** ($0/month).

Haz clic en **"Create Web Service"** abajo del todo.

## 5. ¡Tu Link está Vivo!
Render tardará unos 2 o 3 minutos en instalar todo. Verás un link arriba a la izquierda (algo como `https://planeador-artes-mep.onrender.com`).
-   Haz clic en ese link.
-   **¡IMPORTANTE!**: Añade `/galeria.html` al final del link para entrar a tu app (ej: `https://tu-app.onrender.com/galeria.html`).

---

¡Felicidades! Ahora cualquier profesor de otra casa o cualquier persona con un celular podrá usar tu planeador de artes. ✨🎨
