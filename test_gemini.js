import { GoogleGenerativeAI } from "@google/generative-ai";

async function testConnection(apiKey) {
  const genAI = new GoogleGenerativeAI(apiKey);
  const configs = [
    { model: "gemini-1.5-flash", version: "v1" },
    { model: "gemini-1.5-flash", version: "v1beta" },
    { model: "gemini-1.5-pro", version: "v1" },
    { model: "gemini-1.5-pro", version: "v1beta" }
  ];

  console.log("🚀 Iniciando Prueba de Escudo Gemini...");
  
  for (const config of configs) {
    try {
      console.log(`📡 Probando: ${config.model} en ${config.version}...`);
      const model = genAI.getGenerativeModel({ model: config.model }, { apiVersion: config.version });
      const result = await model.generateContent("Di 'Hola, Wendy' si funcionas.");
      console.log(`✅ ¡ÉXITO! Google respondió: "${result.response.text().trim()}"`);
      return;
    } catch (err) {
      console.warn(`⚠️ Falló ${config.model} (${config.version}): ${err.message}`);
    }
  }
  console.error("❌ TODAS LAS OPCIONES FALLARON. Revisa tu clave API.");
}

// Para probar localmente, descomenta la línea de abajo y pon tu clave:
// testConnection("TU_API_KEY_AQUI");
