import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import PDFDocument from 'pdfkit';
import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuración
const OWNER_EMAIL = process.env.OWNER_EMAIL || 'wenalessa@gmail.com';

const app = express();
app.use(cors());

// Registro simple de usuarios que han pagado (En producción usar DB)
const paidUsersFile = path.join(__dirname, 'paid_users.json');
if (!fs.existsSync(paidUsersFile)) {
  fs.writeFileSync(paidUsersFile, JSON.stringify([]));
}

function getPaidUsers() {
  return JSON.parse(fs.readFileSync(paidUsersFile, 'utf8'));
}

function markAsPaid(email) {
  const users = getPaidUsers();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 90); // 90 días de acceso
  
  const existingUserIndex = users.findIndex(u => u.email === email.toLowerCase());
  if (existingUserIndex > -1) {
    users[existingUserIndex].expiresAt = expiresAt.toISOString();
  } else {
    users.push({ email: email.toLowerCase(), expiresAt: expiresAt.toISOString() });
  }
  fs.writeFileSync(paidUsersFile, JSON.stringify(users));
}

// Middleware para verificar acceso
function checkAccess(req, res, next) {
  const { email } = req.body;
  
  if (!email) return res.status(401).json({ error: 'Email requerido para verificar acceso.' });
  
  const cleanEmail = email.toLowerCase();
  
  // El dueño entra gratis siempre
  if (cleanEmail === OWNER_EMAIL.toLowerCase()) return next(); 
  
  const users = getPaidUsers();
  const userRecord = users.find(u => u.email === cleanEmail);
  
  if (userRecord) {
    const now = new Date();
    const expiry = new Date(userRecord.expiresAt);
    
    if (now < expiry) {
      return next(); // Acceso vigente
    } else {
      return res.status(403).json({ error: 'Tu acceso por 3 meses ha vencido. Por favor, renueva tu suscripción.' });
    }
  }
  
  res.status(403).json({ error: 'Acceso denegado. Debes adquirir el acceso por 3 meses.' });
}

// Servir archivos estáticos
app.use(express.static(__dirname));

// Express JSON middleware (después de webhook si se usa raw body para Stripe)
app.use(express.json());

// Redirigir la raíz a galeria.html para evitar errores en Render
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'galeria.html'));
});

// Endpoint para verificar si un usuario ya pagó y si su acceso sigue vigente
app.post('/api/check-user-access', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ hasAccess: false });
  
  const cleanEmail = email.toLowerCase();
  if (cleanEmail === OWNER_EMAIL.toLowerCase()) {
    return res.json({ hasAccess: true, isOwner: true });
  }
  
  const users = getPaidUsers();
  const userRecord = users.find(u => u.email === cleanEmail);
  
  if (userRecord) {
    const now = new Date();
    const expiry = new Date(userRecord.expiresAt);
    if (now < expiry) {
      return res.json({ 
        hasAccess: true, 
        expiresAt: userRecord.expiresAt,
        daysRemaining: Math.ceil((expiry - now) / (1000 * 60 * 60 * 24))
      });
    }
  }
  
  res.json({ hasAccess: false, expired: !!userRecord });
});

// Mock/Simple Webhook para pruebas (o para que tú mismo habilites correos)
app.post('/api/activate-user-manually', (req, res) => {
  const { email, masterKey } = req.body;
  if (masterKey === process.env.API_KEY_GEMINI) { // Usamos la de Gemini como "password" simple
    markAsPaid(email.toLowerCase());
    return res.json({ success: true, message: `Usuario ${email} activado.` });
  }
  res.status(403).json({ error: 'No autorizado.' });
});


// --- SOLUCIÓN NUCLEAR: AUTO-DESCUBRIMIENTO Y FALLBACK REST ---
async function generateWithFallback(apiKey, prompt, isJson = false) {
  const cleanKey = apiKey.trim().replace(/[\n\r]/g, '');
  
  try {
    console.log("🔍 Iniciando Auto-Descubrimiento de modelos...");
    const genAI = new GoogleGenerativeAI(cleanKey);
    
    // 1. Intentar listar modelos para ver qué hay disponible para esta clave
    let availableModels = [];
    try {
      // Intentamos con la versión v1beta que es la más rica en info
      const listResp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${cleanKey}`);
      const listData = await listResp.json();
      if (listData.models) {
        availableModels = listData.models
          .filter(m => m.supportedGenerationMethods.includes('generateContent'))
          .map(m => m.name.replace('models/', ''));
        console.log("✅ Modelos detectados para esta clave:", availableModels.join(', '));
      }
    } catch (listErr) {
      console.warn("⚠️ No se pudo listar modelos, usando lista de emergencia.");
      availableModels = ["gemini-1.5-flash", "gemini-1.5-pro", "gemini-pro"];
    }

    // 2. Intentar modelos en orden de preferencia
    const modelsToTry = [...new Set([...availableModels, "gemini-1.5-flash", "gemini-1.5-pro", "gemini-pro"])];
    let lastError = null;

    for (const modelName of modelsToTry) {
      // Probamos cada modelo tanto en v1 como en v1beta
      for (const version of ["v1", "v1beta"]) {
        try {
          console.log(`📡 Intentando: ${modelName} (${version})...`);
          
          // INTENTO A: Usando el SDK oficial
          const model = genAI.getGenerativeModel({ model: modelName }, { apiVersion: version });
          const result = await model.generateContent(prompt);
          const response = await result.response;
          const text = response.text();

          if (isJson) {
            let cleanJson = text.trim();
            if (cleanJson.includes('```')) {
              const parts = cleanJson.split('```');
              cleanJson = parts[1].replace(/^json/, '').trim();
            }
            return JSON.parse(cleanJson);
          }
          console.log(`✨ ¡ÉXITO TOTAL con ${modelName} (${version})!`);
          return text;
        } catch (sdkErr) {
          console.warn(`❌ Fallo SDK con ${modelName} (${version}):`, sdkErr.message);
          
          // INTENTO B: Cruce de Emergencia (Fetch Directo)
          // Si el SDK falla por entorno (Render), probamos comunicación directa vía REST
          try {
            console.log(`🔌 Probando conexión directa (REST) para ${modelName}...`);
            const restResp = await fetch(`https://generativelanguage.googleapis.com/${version}/models/${modelName}:generateContent?key=${cleanKey}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
            });
            
            const restData = await restResp.json();
            if (restResp.ok && restData.candidates) {
              const text = restData.candidates[0].content.parts[0].text;
              if (isJson) {
                let cleanJson = text.trim();
                if (cleanJson.includes('```')) {
                  const parts = cleanJson.split('```');
                  cleanJson = parts[1].replace(/^json/, '').trim();
                }
                return JSON.parse(cleanJson);
              }
              console.log(`🔗 ¡ÉXITO REST con ${modelName}! Bypassing SDK.`);
              return text;
            }
          } catch (restErr) {
            console.warn(`❌ Fallo REST con ${modelName}:`, restErr.message);
          }
          
          lastError = sdkErr;
          if (!sdkErr.message.includes('404')) break; // Si no es 404, el problema es la clave o el prompt
        }
      }
    }
    throw lastError;
  } catch (err) {
    console.error(`🔴 ERROR FINAL:`, err.message);
    throw new Error(`Google AI Bloqueado (404/500). Por favor, revisa que tu API Key sea de Google AI Studio y tenga permisos para Gemini 1.5.`);
  }
}

let mepContentCache = null;

async function loadMEPContent() {
  if (mepContentCache) return mepContentCache;
  const pdfPath = path.join(__dirname, 'programa_estudios_artes_plasticas_mep.pdf');
  try {
    const dataBuffer = fs.readFileSync(pdfPath);
    const data = await pdfParse(dataBuffer);
    mepContentCache = data.text;
    console.log('PDF del MEP cargado en memoria exitosamente.');
    return mepContentCache;
  } catch (error) {
    console.error('Error al leer el PDF del MEP:', error);
    return 'Documento MEP no encontrado o no legible.';
  }
}

// RUTA PROTEGIDA CON checkAccess
app.post('/api/generate-plan', checkAccess, async (req, res) => {
  try {
    const { nivel, tema, instruccionesExtra, apiKey } = req.body;

    
    if (!nivel || !tema || !apiKey) {
      return res.status(400).json({ error: 'Nivel, Tema y API Key son requeridos.' });
    }

    const mepText = await loadMEPContent();

    const systemInstruction = `Eres un experto pedagogo del MEP Costa Rica. Crea un planeamiento de Artes Plásticas basado en el programa oficial. 
      Tu respuesta debe ser un objeto JSON con esta estructura:
      {
        "regional": "Guápiles",
        "centro": "Liceo Académico de Cariari",
        "docente": "Wendy González Víquez",
        "competenciaEspecifica": "Autoexpresión y apreciación estética a través de [tema].",
        "aprendizajes": ["Aprendizaje 1", "Aprendizaje 2"],
        "mediacion": {
          "materiales": ["Material 1", "Material 2"],
          "focalizacion": "Actividad de inicio...",
          "exploracion": "Actividad de desarrollo...",
          "aplicacion": "Actividad de cierre y creación..."
        },
        "indicadores": ["Indicador 1", "Indicador 2"]
      }`;

    const promptText = `
    INSTRUCCIÓN: ${systemInstruction}
    
    Basado en el extracto del programa MEP:
    ---
    ${mepText.substring(0, 15000)}
    ---
    Nivel: ${nivel}, Tema: "${tema}". 
    Input docente: ${instruccionesExtra || 'Ninguna'}.
    Responde SOLO el JSON.`;

    console.log(`Pidiendo a Gemini: Planeamiento Estructurado para ${nivel} - ${tema}...`);
    
    // USAR HELPER CON LIMPIEZA DE KEY
    const plan = await generateWithFallback(apiKey, promptText, true);

    // --- GENERACIÓN DE PDF REPLICA WORD MEP ---
    const pdfFileName = `Planeamiento_Oficial_${nivel}_${tema.replace(/\s+/g, '_')}.pdf`;
    const doc = new PDFDocument({ margin: 30, size: 'A4' });
    const pdfPath = path.join(__dirname, pdfFileName);
    const writeStream = fs.createWriteStream(pdfPath);
    
    doc.pipe(writeStream);
    
    // Título Superior
    doc.fontSize(10).font('Helvetica-Bold').text('PLANTILLA DE PLANEAMIENTO DIDÁCTICO DE Artes Plásticas de III CICLO Y EDUCACION DIVERSIFICADA', { align: 'left' });
    doc.moveDown(0.5);

    let curY = doc.y;
    const halfW = 265;
    const rowH = 35;

    // --- TABLA DE ENCABEZADO (3 FILAS) ---
    doc.rect(30, curY, halfW, rowH).stroke();
    doc.fontSize(8).font('Helvetica-Bold').text('Dirección Regional de Guápiles', 35, curY + 12);
    doc.rect(30 + halfW, curY, halfW, rowH).stroke();
    doc.text('Centro educativo: ', 35 + halfW, curY + 12, { continued: true }).font('Helvetica').text(plan.centro);
    
    curY += rowH;
    doc.rect(30, curY, halfW, rowH + 10).stroke();
    doc.font('Helvetica-Bold').text('Nombre de la persona docente: ', 35, curY + 15, { continued: true }).font('Helvetica').text(plan.docente);
    doc.rect(30 + halfW, curY, halfW, rowH + 10).stroke();
    doc.font('Helvetica-Bold').text('Asignatura, módulo, disciplina, especialidad, componente, área o subárea: ', 35 + halfW, curY + 5, { width: halfW - 10 }).font('Helvetica').text('Artes Plásticas');
    
    curY += rowH + 10;
    doc.rect(30, curY, halfW, rowH).stroke();
    doc.font('Helvetica-Bold').text('Nivel: ', 35, curY + 12, { continued: true }).font('Helvetica').text(nivel);
    doc.rect(30 + halfW, curY, halfW / 2, rowH).stroke();
    doc.font('Helvetica-Bold').text('Curso lectivo: ', 35 + halfW, curY + 12, { continued: true }).font('Helvetica').text('2026');
    doc.rect(30 + halfW + (halfW / 2), curY, halfW / 2, rowH).stroke();
    doc.fontSize(7).font('Helvetica-Bold').text('Periodicidad:', 35 + halfW + (halfW / 2), curY + 3);
    doc.text('( ) mes ( ) bimestre ( ) trimestre ( ) semestre', 35 + halfW + (halfW / 2), curY + 15);
    
    curY += rowH + 15;
    doc.y = curY;
    doc.fontSize(9).font('Helvetica-Bold').text('Competencia general (marque con una equis):');
    doc.moveDown(0.3);
    
    let compY = doc.y;
    const compW = 176;
    doc.rect(30, compY, compW, rowH).stroke();
    doc.fontSize(8).font('Helvetica').text('( )    Ciudadanía responsable y\n        solidaria', 35, compY + 8);
    doc.rect(30 + compW, compY, compW, rowH).stroke();
    doc.font('Helvetica').text('( )    Competencias\n        para la vida', 35 + compW, compY + 8);
    doc.rect(30 + (compW * 2), compY, compW, rowH).stroke();
    doc.font('Helvetica').text('( )    Competencias para la\n        empleabilidad digna', 35 + (compW * 2), compY + 8);
    
    curY = compY + rowH + 15;
    doc.fontSize(9).font('Helvetica-Bold').text('Competencia específica:', 35, curY);
    doc.font('Helvetica').text(plan.competenciaEspecifica, 35, doc.y + 2);
    doc.moveDown(1);

    const tableTop = doc.y;
    const c1 = 140, c2 = 250, c3 = 140;
    doc.rect(30, tableTop, 530, 30).fill('#d9d9d9').stroke();
    doc.fillColor('#000000').font('Helvetica-Bold').fontSize(9);
    doc.text('Aprendizajes Esperados', 35, tableTop + 10, { width: c1 - 10, align: 'center' });
    doc.text('Estrategias de Mediación (Actividades Sugeridas)', 35 + c1, tableTop + 5, { width: c2 - 10, align: 'center' });
    doc.text('Indicadores de Evaluación', 35 + c1 + c2, tableTop + 10, { width: c3 - 10, align: 'center' });

    const bodyY = tableTop + 30;
    const medText = `Lista de materiales:\n${plan.mediacion.materiales.map((m, i) => `${i+1}. ${m}`).join('\n')}\n\nFocalización: ${plan.mediacion.focalizacion}\n\nExploración: ${plan.mediacion.exploracion}\n\nAplicación: ${plan.mediacion.aplicacion}`;
    
    const h = Math.max(
      doc.heightOfString(plan.aprendizajes.join('\n\n'), { width: c1 - 10 }),
      doc.heightOfString(medText, { width: c2 - 10 }),
      doc.heightOfString(plan.indicadores.join('\n\n'), { width: c3 - 10 })
    ) + 30;

    doc.rect(30, bodyY, c1, h).stroke();
    doc.rect(30 + c1, bodyY, c2, h).stroke();
    doc.rect(30 + c1 + c2, bodyY, c3, h).stroke();

    doc.font('Helvetica').fontSize(8);
    // IMPORTANTE: Todas las columnas deben empezar en bodyY + 10 para estar alineadas arriba
    doc.text(plan.aprendizajes.join('\n\n'), 35, bodyY + 10, { width: c1 - 10 });
    doc.text(medText, 35 + c1, bodyY + 10, { width: c2 - 10 });
    doc.text(plan.indicadores.join('\n\n'), 35 + c1 + c2, bodyY + 10, { width: c3 - 10 });

    // --- RECUADRO DE OBSERVACIONES ---
    doc.y = bodyY + h + 20;
    if (doc.y > 700) doc.addPage();
    
    curY = doc.y;
    doc.rect(30, curY, 530, 150).stroke(); // Recuadro de ~10 renglones
    doc.font('Helvetica-Bold').fontSize(9).text('OBSERVACIONES:', 35, curY + 10);
    
    // Dibujar 10 líneas tenues para escribir
    doc.strokeColor('#cccccc').lineWidth(0.5);
    for (let i = 1; i <= 10; i++) {
      let lineY = curY + 25 + (i * 12);
      doc.moveTo(35, lineY).lineTo(555, lineY).stroke();
    }
    doc.strokeColor('#000000').lineWidth(1.0); // Reset

    doc.end();
    writeStream.on('finish', () => {
      res.json({ success: true, plan: plan, pdfUrl: `/${pdfFileName}` });
    });
  } catch (error) {
    console.error('ERROR DETALLADO EN GENERACIÓN:', error);
    res.status(500).json({ 
      error: 'Error interno en el servidor al generar el planeamiento.', 
      mensaje: error.message,
      stack: error.stack 
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n======================================================`);
  console.log(`🚀 SERVIDOR MEP-IA INICIADO EN EL PUERTO: ${PORT}`);
  console.log(`======================================================`);
});
