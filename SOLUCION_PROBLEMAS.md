# 🛠️ Guía de Solución de Problemas y Actualizaciones

Si algo no funciona o quieres hacer cambios en el futuro, aquí tienes la "hoja de ruta" para arreglarlo todo:

## 1. El flujo de trabajo "Maestro"
Siempre que quieras cambiar algo, sigue este orden para no perderte:
1.  **Cambia en tu PC**: Haz el arreglo en los archivos de tu carpeta local.
2.  **Prueba en tu PC**: Inicia la app con `INICIAR_APP.bat` y verifica que el error se quitó.
3.  **Sube a GitHub**: Sube solo los archivos que cambiaste a tu repositorio de GitHub (usando "Add file" -> "Upload files").
4.  **Auto-magia**: Render detectará el cambio automáticamente y actualizará tu web en unos 2 minutos.

## 2. Errores Comunes y Soluciones

### ❌ El link de Render da Error 404 (Not Found)
- **Causa**: Olvidaste poner `/galeria.html` al final.
- **Solución**: Asegúrate de que el link sea: `https://tu-app.onrender.com/galeria.html`

### ❌ La IA no genera el planeamiento
- **Causa**: La API Key es incorrecta o expiró.
- **Solución**: Verifica tu clave en [Google AI Studio](https://aistudio.google.com/app/apikey) y pégala de nuevo en la app.

### ❌ La página de Render dice "Slept" o tarda mucho en abrir
- **Causa**: Al ser el plan gratuito, Render "duerme" la app si nadie la usa en 15 minutos.
- **Solución**: Solo espera unos 30-50 segundos a que despierte. Una vez abierta, funcionará rápido.

### ❌ Los PDFs no se descargan o salen en blanco
- **Causa**: Error en el servidor al procesar el JSON de la IA.
- **Solución**: Revisa que el tema que pusiste no tenga caracteres muy extraños. Si persiste, el error quedará registrado en el panel de Render (pestaña "Logs").

## 3. ¿Cómo ver qué está pasando "por dentro"?
Si la web falla, ve a tu panel de **Render.com**, haz clic en tu servicio y entra a la pestaña **"Logs"**.
- Si ves letras ROJAS, ahí dirá exactamente qué línea de código está fallando.
- ¡Puedes copiar ese error y pedírmelo a mí (o a otra IA) para que te demos la solución exacta!

---
> **Consejo de Oro**: ¡Siempre mantén una copia de seguridad de tu carpeta `ANTIGRAVITY IA FOLDER`! Es tu base de operaciones segura.
