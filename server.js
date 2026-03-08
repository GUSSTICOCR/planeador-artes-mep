import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import PDFDocument from 'pdfkit';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

// Servir archivos estáticos
app.use(express.static(__dirname));

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

app.post('/api/generate-plan', async (req, res) => {
  try {
    const { nivel, tema, instruccionesExtra, apiKey } = req.body;
    
    if (!nivel || !tema || !apiKey) {
      return res.status(400).json({ error: 'Nivel, Tema y API Key son requeridos.' });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" }); 

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

    console.log(`Pidiendo a Gemini 2.x: Planeamiento Estructurado para ${nivel} - ${tema}...`);
    
    const result = await model.generateContent(promptText);
    const responseText = result.response.text();
    
    // Limpieza de JSON
    let cleanJson = responseText.trim();
    if (cleanJson.includes('```')) {
      cleanJson = cleanJson.split('```')[1].replace(/^json/, '').trim();
    }
    
    const plan = JSON.parse(cleanJson);

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

// --- NUEVO: ENDPOINT PARA EL CHAT DINÁMICO ---
app.post('/api/chat', async (req, res) => {
  console.log('--- NUEVA SOLICITUD DE CHAT RECIBIDA ---');
  try {
    const { mensaje, apiKey } = req.body;
    if (!mensaje || !apiKey) {
      console.log('Error: Mensaje o API Key faltantes');
      return res.status(400).json({ error: 'Mensaje y API Key requeridos en el servidor.' });
    }

    console.log('Consultando a Gemini 1.5-flash...');
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `Eres un asistente experto para profesores de Artes Plásticas. 
    Responde de forma profesional, creativa y pedagógica. 
    El profesor pregunta: "${mensaje}"`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    console.log('Respuesta de Gemini obtenida con éxito.');
    res.json({ respuesta: text });
  } catch (error) {
    console.error('ERROR CRÍTICO EN CHAT:', error);
    res.status(500).json({ error: 'Error interno del servidor al hablar con la IA.', details: error.message });
  }
});
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n======================================================`);
  console.log(`🚀 SERVIDOR MEP-IA INICIADO EN EL PUERTO: ${PORT}`);
  console.log(`======================================================`);
});
