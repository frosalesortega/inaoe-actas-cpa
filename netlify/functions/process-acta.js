// Netlify function: receives PDF/DOCX, sends to Gemini API, returns structured JSON
const mammoth = require('mammoth');

const PROMPT = `Eres un asistente que estructura actas del Colegio del Personal Académico (CPA) del INAOE en formato JSON.

A partir del texto del acta que te proporcione, genera un JSON con esta estructura exacta:

{
  "acta": "[número de acta tal como aparece en el documento, ej: CPA-28082025]",
  "fecha": "YYYY-MM-DD",
  "fechaLabel": "[fecha en formato legible, ej: 28 de agosto de 2025]",
  "items": [
    {
      "tipo": "acuerdo | tema | seguimiento | general",
      "titulo": "[título conciso del punto]",
      "texto": "[resumen del contenido, máximo 2-3 oraciones]",
      "tags": ["palabra1", "palabra2", "..."],
      "area": "[área o coordinación si aplica, ej: Coordinación de Óptica]"
    }
  ]
}

Reglas:
- tipo "acuerdo": decisiones formales con número de acuerdo (ACUERDO 1.- CPAEX-..., etc.)
- tipo "seguimiento": puntos de seguimiento de acuerdos de sesiones previas
- tipo "tema": asuntos discutidos, votaciones, presentaciones, propuestas (sin ser acuerdo formal)
- tipo "general": asuntos generales, informes breves, temas varios
- Los tags deben incluir: nombres de personas mencionadas, áreas o coordinaciones, temas clave, resultados de votaciones relevantes, y sinónimos útiles para búsqueda
- El campo "area" solo se incluye si el punto está claramente bajo una coordinación o dirección específica
- Para votaciones, incluir el resultado resumido en el texto
- Responde SOLO con el JSON válido, sin texto adicional, sin backticks, sin markdown`;

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Método no permitido' }) };

  const { GEMINI_API_KEY, ADMIN_PASSWORD } = process.env;
  if (!GEMINI_API_KEY) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Falta la variable GEMINI_API_KEY en Netlify.' }) };
  }

  let body;
  try { body = JSON.parse(event.body); } catch (e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Request inválido.' }) };
  }

  if (body.password !== ADMIN_PASSWORD) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Contraseña incorrecta.' }) };
  }

  if (!body.fileData || !body.fileName) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Falta el archivo.' }) };
  }

  const fileBuffer = Buffer.from(body.fileData, 'base64');
  const ext = body.fileName.toLowerCase().split('.').pop();

  try {
    let geminiParts = [];

    if (ext === 'pdf') {
      // Send PDF directly to Gemini (it can read PDFs natively)
      geminiParts = [
        { text: PROMPT },
        { inline_data: { mime_type: 'application/pdf', data: body.fileData } }
      ];
    } else if (ext === 'docx' || ext === 'doc') {
      // Extract text from Word with mammoth, then send as text
      const result = await mammoth.extractRawText({ buffer: fileBuffer });
      const docText = result.value;
      if (!docText || docText.trim().length < 50) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'No se pudo extraer texto del documento Word. Verifica que el archivo no esté vacío.' }) };
      }
      geminiParts = [
        { text: PROMPT + '\n\nTexto del acta:\n\n' + docText }
      ];
    } else {
      return { statusCode: 400, headers, body: JSON.stringify({ error: `Formato "${ext}" no soportado. Usa PDF o Word (.docx).` }) };
    }

    // Call Gemini API — using flash-lite for speed (26s Netlify timeout)
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`;

    const geminiResp = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: geminiParts }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 8192,
          thinkingConfig: { thinkingBudget: 0 }
        }
      })
    });

    if (!geminiResp.ok) {
      const errData = await geminiResp.json().catch(() => ({}));
      console.error('Gemini API error:', JSON.stringify(errData));
      const errMsg = errData?.error?.message || `Error ${geminiResp.status}`;
      return { statusCode: 502, headers, body: JSON.stringify({ error: `Error de Gemini API: ${errMsg}` }) };
    }

    const geminiData = await geminiResp.json();

    // Extract text from response
    let responseText = '';
    if (geminiData.candidates && geminiData.candidates[0]?.content?.parts) {
      responseText = geminiData.candidates[0].content.parts
        .filter(p => p.text)
        .map(p => p.text)
        .join('');
    }

    if (!responseText) {
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Gemini no devolvió contenido. Intenta de nuevo.' }) };
    }

    // Parse JSON from response (handle possible markdown fences)
    let clean = responseText.trim();
    if (clean.startsWith('```')) clean = clean.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');

    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch (e) {
      return { statusCode: 422, headers, body: JSON.stringify({
        error: 'Gemini devolvió una respuesta que no es JSON válido. Puedes intentar de nuevo o usar el modo manual.',
        rawResponse: clean.substring(0, 2000)
      })};
    }

    // Basic validation
    if (!parsed.acta || !parsed.fecha || !parsed.fechaLabel || !Array.isArray(parsed.items)) {
      return { statusCode: 422, headers, body: JSON.stringify({
        error: 'El JSON generado no tiene la estructura correcta. Intenta de nuevo o usa el modo manual.',
        rawResponse: clean.substring(0, 2000)
      })};
    }

    return {
      statusCode: 200, headers,
      body: JSON.stringify({ success: true, acta: parsed })
    };

  } catch (e) {
    console.error('Processing error:', e);
    return { statusCode: 500, headers, body: JSON.stringify({ error: `Error de procesamiento: ${e.message}` }) };
  }
};
