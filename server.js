import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');
import { GoogleGenerativeAI } from '@google/generative-ai';
import puppeteer from 'puppeteer';
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

// --- PERFIL DE DOCENTE ---
app.post('/api/save-profile', (req, res) => {
  const { email, nombre, centroEducativo, direccionRegional } = req.body;
  if (!email) return res.status(400).json({ error: 'Email requerido.' });

  const users = getPaidUsers();
  const cleanEmail = email.toLowerCase();
  const idx = users.findIndex(u => u.email === cleanEmail);

  // El dueño siempre puede guardar perfil aunque no esté en la lista
  if (idx > -1) {
    users[idx].nombre = nombre || users[idx].nombre || '';
    users[idx].centroEducativo = centroEducativo || users[idx].centroEducativo || '';
    users[idx].direccionRegional = direccionRegional || users[idx].direccionRegional || '';
    fs.writeFileSync(paidUsersFile, JSON.stringify(users));
    return res.json({ success: true });
  } else if (cleanEmail === OWNER_EMAIL.toLowerCase()) {
    // Dueño: guardar perfil en un registro temporal
    users.push({ email: cleanEmail, expiresAt: new Date(9999,0,1).toISOString(), nombre, centroEducativo, direccionRegional });
    fs.writeFileSync(paidUsersFile, JSON.stringify(users));
    return res.json({ success: true });
  }

  res.status(403).json({ error: 'Usuario no registrado.' });
});

app.get('/api/get-profile', (req, res) => {
  const email = (req.query.email || '').toLowerCase();
  if (!email) return res.status(400).json({ error: 'Email requerido.' });

  const users = getPaidUsers();
  const user = users.find(u => u.email === email);
  if (user) {
    return res.json({
      nombre: user.nombre || '',
      centroEducativo: user.centroEducativo || '',
      direccionRegional: user.direccionRegional || ''
    });
  }
  // Si es el dueño pero no está aún en el archivo
  if (email === OWNER_EMAIL.toLowerCase()) {
    return res.json({ nombre: '', centroEducativo: '', direccionRegional: '' });
  }
  res.status(404).json({ error: 'Perfil no encontrado.' });
});

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

// Endpoint para el panel de administración: listar usuarios
app.post('/api/list-users', (req, res) => {
  const { masterKey } = req.body;
  if (masterKey === process.env.API_KEY_GEMINI) {
    const users = getPaidUsers();
    
    // Ordenar alfabéticamente (primero por nombre, si no hay, por email)
    users.sort((a, b) => {
      const nameA = a.nombre || a.email || '';
      const nameB = b.nombre || b.email || '';
      return nameA.localeCompare(nameB, 'es', { sensitivity: 'base' });
    });
    
    return res.json({ success: true, users });
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

let mepSecondaryCache = null;
let mepPrimaryCache = null;

async function loadMEPContent(isPrimary = false) {
  if (isPrimary && mepPrimaryCache) return mepPrimaryCache;
  if (!isPrimary && mepSecondaryCache) return mepSecondaryCache;

  const fileName = isPrimary 
    ? path.join(__dirname, 'progama_mep_primaria.pdf.pdf') 
    : path.join(__dirname, 'programa_estudios_artes_plasticas_mep.pdf');
  
  try {
    const dataBuffer = fs.readFileSync(fileName);
    const data = await pdfParse(dataBuffer);
    if (isPrimary) {
      mepPrimaryCache = data.text;
      console.log('PDF de Primaria (1 y 2 ciclo) cargado con éxito.');
      return mepPrimaryCache;
    } else {
      mepSecondaryCache = data.text;
      console.log('PDF de Secundaria cargado con éxito.');
      return mepSecondaryCache;
    }
  } catch (error) {
    console.error(`Error al leer el PDF (${isPrimary ? 'Primaria' : 'Secundaria'}):`, error);
    return 'Documento MEP no encontrado o no legible.';
  }
}

// RUTA PROTEGIDA CON checkAccess
app.post('/api/generate-plan', checkAccess, async (req, res) => {
  try {
    const { nivel, tema, instruccionesExtra, nombre, centroEducativo, direccionRegional } = req.body;
    // Datos del perfil del docente (con fallback por si no se enviaron)
    const docente = nombre || 'Docente';
    const centro = centroEducativo || '________________________________';
    const regional = direccionRegional || '________________________________';

    
    if (!nivel || !tema) {
      return res.status(400).json({ error: 'Nivel y Tema son requeridos.' });
    }

    // Determinar si es primaria (1° a 6°) o secundaria (7° a 11/12°)
    const isPrimary = ['1°', '2°', '3°', '4°', '5°', '6°'].includes(nivel);
    const mepText = await loadMEPContent(isPrimary);

    const systemInstruction = `Eres un experto pedagogo del MEP Costa Rica, especializado en ${isPrimary ? 'Educación Primaria (I y II Ciclo)' : 'Educación Secundaria'}. 
      Crea un planeamiento de Artes Plásticas basado en el programa oficial. 
      Tu respuesta debe ser un objeto JSON con esta estructura:
      {
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
    const plan = await generateWithFallback(process.env.API_KEY_GEMINI, promptText, true);

    // SANEAR RESPUESTA DE GEMINI PARA EVITAR ERRORES "UNDEFINED"
    if (!plan) throw new Error("Google Gemini devolvió una respuesta vacía.");
    plan.competenciaEspecifica = plan.competenciaEspecifica || "Competencia no especificada.";
    plan.aprendizajes = Array.isArray(plan.aprendizajes) ? plan.aprendizajes : ["(No se encontraron aprendizajes)"];
    plan.indicadores = Array.isArray(plan.indicadores) ? plan.indicadores : ["(No se encontraron indicadores)"];
    
    if (!plan.mediacion) plan.mediacion = {};
    plan.mediacion.materiales = Array.isArray(plan.mediacion.materiales) ? plan.mediacion.materiales : ["(Materiales no especificados)"];
    plan.mediacion.focalizacion = plan.mediacion.focalizacion || "Focalización no especificada.";
    plan.mediacion.exploracion = plan.mediacion.exploracion || "Exploración no especificada.";
    plan.mediacion.aplicacion = plan.mediacion.aplicacion || "Aplicación no especificada.";

    // --- GENERACIÓN DE PDF REPLICA WORD MEP (VÍA HTML + PUPPETEER) ---
    const pdfFileName = `Planeamiento_Oficial_${nivel}_${tema.replace(/\s+/g, '_')}.pdf`;
    const pdfPath = path.join(__dirname, pdfFileName);
    
    const medText = `<strong>Lista de materiales:</strong><br>${plan.mediacion.materiales.map((m, i) => `${i+1}. ${m}`).join('<br>')}<br><br><strong>Focalización:</strong><br>${plan.mediacion.focalizacion}<br><br><strong>Exploración:</strong><br>${plan.mediacion.exploracion}<br><br><strong>Aplicación:</strong><br>${plan.mediacion.aplicacion}`;
    
    const htmlContent = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <style>
        body {
          font-family: 'Helvetica', 'Arial', sans-serif;
          font-size: 11px;
          margin: 0;
          padding: 0;
          color: #000;
        }
        .container {
          padding: 20px;
        }
        h1 {
          font-size: 13px;
          font-weight: bold;
          text-align: left;
          margin-bottom: 20px;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 15px;
          page-break-inside: auto;
        }
        tr, td, th { page-break-inside: auto; }
        th, td {
          border: 1px solid #000;
          padding: 6px;
          vertical-align: top;
        }
        th {
          background-color: #d9d9d9 !important;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
          font-weight: bold;
          text-align: center;
        }
        .header-table td {
          font-size: 10px;
          padding: 8px;
        }
        strong { font-weight: bold; }
        .competencias-table th { background-color: transparent !important; border: none; font-size: 12px; text-align: left; padding-left: 0; }
        .competencias-list td { text-align: left; padding: 10px; font-size: 10px; }
        
        .main-table { table-layout: fixed; }
        .main-table th:nth-child(1), .main-table td:nth-child(1) { width: 25%; }
        .main-table th:nth-child(2), .main-table td:nth-child(2) { width: 50%; }
        .main-table th:nth-child(3), .main-table td:nth-child(3) { width: 25%; }
        
        .main-table td { font-size: 10px; line-height: 1.4; white-space: pre-wrap; }
        
        .observaciones {
          border: 1px solid #000;
          height: 150px;
          padding: 10px;
          margin-top: 20px;
          position: relative;
          page-break-inside: avoid;
        }
        .observaciones-title {
          font-weight: bold;
          font-size: 11px;
          margin-bottom: 5px;
        }
        .linea {
          border-bottom: 1px solid #ccc;
          height: 12px;
          margin-top: 2px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>PLANTILLA DE PLANEAMIENTO DIDÁCTICO DE Artes Plásticas de ${isPrimary ? 'I Y II CICLO' : 'III CICLO Y EDUCACION DIVERSIFICADA'}</h1>
        
        <table class="header-table">
          <tr>
            <td width="50%"><strong>Dirección Regional de:</strong> ${direccionRegional || '________________________________'}</td>
            <td width="50%"><strong>Centro educativo:</strong> ${centroEducativo || '________________________________'}</td>
          </tr>
          <tr>
            <td><strong>Nombre de la persona docente:</strong> ${nombre || '________________________________'}</td>
            <td><strong>Asignatura:</strong> Artes Plásticas</td>
          </tr>
          <tr>
            <td style="border: 1px solid #000; padding: 6px;"><strong>Nivel:</strong> ${nivel}</td>
            <td style="padding: 0; border: none;">
              <table style="margin: 0; border: none; border-collapse: collapse; width: 100%; height: 100%;">
                <tr>
                  <td style="border: 1px solid #000; padding: 6px; width: 50%;"><strong>Curso lectivo:</strong> 2026</td>
                  <td style="border: 1px solid #000; padding: 6px; width: 50%; font-size: 8px;"><strong>Periodicidad:</strong><br>&nbsp;( ) mes &nbsp; ( ) bimestre &nbsp; ( ) trimestre &nbsp; ( ) semestre</td>
                </tr>
              </table>
            </td>
          </tr>
        </table>

        
        <table class="competencias-table" style="margin-bottom: 5px;">
          <tr>
            <th><strong>Competencia general (marque con una equis):</strong></th>
          </tr>
        </table>
        
        <table class="competencias-list">
          <tr>
            <td width="33%">( ) Ciudadanía responsable y solidaria</td>
            <td width="33%">( ) Competencias para la vida</td>
            <td width="34%">( ) Competencias para la empleabilidad digna</td>
          </tr>
        </table>
        
        <div style="margin-bottom: 15px;">
          <strong>Competencia específica:</strong><br>
          <span style="font-size: 11px;">${plan.competenciaEspecifica}</span>
        </div>

        <table class="main-table">
          <thead>
            <tr>
              <th>Aprendizajes Esperados</th>
              <th>Estrategias de Mediación (Actividades Sugeridas)</th>
              <th>Indicadores de Evaluación</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>${plan.aprendizajes.join('<br><br>')}</td>
              <td style="white-space: normal;">${medText}</td>
              <td>${plan.indicadores.join('<br><br>')}</td>
            </tr>
          </tbody>
        </table>

        <div class="observaciones">
          <div class="observaciones-title">OBSERVACIONES:</div>
          <div class="linea"></div>
          <div class="linea"></div>
          <div class="linea"></div>
          <div class="linea"></div>
          <div class="linea"></div>
          <div class="linea"></div>
          <div class="linea"></div>
          <div class="linea"></div>
          <div class="linea"></div>
          <div class="linea"></div>
        </div>
      </div>
    </body>
    </html>
    `;

    const browser = await puppeteer.launch({ 
      headless: true, 
      args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox', 
        '--disable-dev-shm-usage', 
        '--disable-gpu',
        '--single-process',
        '--no-zygote',
        '--disable-software-rasterizer'
      ] 
    });
    const page = await browser.newPage();
    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
    
    await page.pdf({
      path: pdfPath,
      format: 'A4',
      margin: {
        top: '20px',
        right: '20px',
        bottom: '20px',
        left: '20px'
      },
      printBackground: true
    });
    
    await browser.close();

    res.json({ success: true, plan: plan, pdfUrl: `/${pdfFileName}` });
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
