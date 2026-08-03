// Netlify function: receives PDF/DOCX, sends to Gemini API, returns structured JSON
// Tries multiple models as fallback if one is overloaded or deprecated
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
      "area": "[área responsable si aplica, ej: Coordinación de Óptica]"
    }
  ]
}

Reglas:
- tipo "acuerdo": decisiones formales con número de acuerdo (ACUERDO 1.- CPAEX-..., etc.)
- tipo "seguimiento": puntos de seguimiento de sesiones previas
- tipo "tema": asuntos discutidos, votaciones, presentaciones, propuestas (sin ser acuerdo formal)
- tipo "general": asuntos generales, informes breves, temas varios
- Los tags deben incluir: nombres de personas mencionadas, áreas o coordinaciones, temas clave, y sinónimos útiles para búsqueda
- El campo "area" solo se incluye si el punto está claramente bajo una coordinación o dirección específica
- Para votaciones, incluir el resultado resumido en el texto
- Responde SOLO con el JSON válido, sin texto adicional, sin backticks, sin markdown`;

// Free-tier models Aug 2026 — ordered by preference
// If Google deprecates one, the fallback chain catches it automatically
const MODELS = [
  'gemini-3-flash',
  'gemini-3.1-flash-lite',
  'gemini-2.5-flash',
  'gemini-1.5-flash'
];

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
      geminiParts = [
        { text: PROMPT },
        { inline_data: { mime_type: 'application/pdf', data: body.fileData } }
      ];
    } else if (ext === 'docx' || ext === 'doc') {
      const result = await mammoth.extractRawText({ buffer: fileBuffer });
      const docText = result.value;
      if (!docText || docText.trim().length < 50) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'No se pudo extraer texto del documento Word.' }) };
      }
      geminiParts = [
        { text: PROMPT + '\n\nTexto del acta:\n\n' + docText }
      ];
    } else {
      return { statusCode: 400, headers, body: JSON.stringify({ error: `Formato "${ext}" no soportado. Usa PDF o Word (.docx).` }) };
    }

    let lastError = '';
    let responseText = '';

    for (const model of MODELS) {
      try {
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;

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
          lastError = errData?.error?.message || `Error ${geminiResp.status}`;
          console.log(`Model ${model} failed: ${lastError}`);

          // Retryable errors — try next model
          if (geminiResp.status === 429 || geminiResp.status === 503 || geminiResp.status === 404 ||
              lastError.includes('high demand') || lastError.includes('overloaded') ||
              lastError.includes('no longer available') || lastError.includes('not found') ||
              lastError.includes('deprecated')) {
            continue;
          }
          return { statusCode: 502, headers, body: JSON.stringify({ error: `Error de Gemini API: ${lastError}` }) };
        }

        const geminiData = await geminiResp.json();

        if (geminiData.candidates && geminiData.candidates[0]?.content?.parts) {
          responseText = geminiData.candidates[0].content.parts
            .filter(p => p.text)
            .map(p => p.text)
            .join('');
        }

        if (responseText) {
          console.log(`Success with model: ${model}`);
          break;
        }
      } catch (fetchErr) {
        lastError = fetchErr.message;
        console.log(`Model ${model} fetch error: ${lastError}`);
        continue;
      }
    }

    if (!responseText) {
      return { statusCode: 502, headers, body: JSON.stringify({ error: `Todos los modelos están saturados. Último error: ${lastError}. Intenta en unos minutos o usa "Agregar manualmente".` }) };
    }

    let clean = responseText.trim();
    if (clean.startsWith('```')) clean = clean.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');

    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch (e) {
      return { statusCode: 422, headers, body: JSON.stringify({
        error: 'Gemini no devolvió JSON válido. Intenta de nuevo o usa el modo manual.',
        rawResponse: clean.substring(0, 2000)
      })};
    }

    if (!parsed.acta || !parsed.fecha || !parsed.fechaLabel || !Array.isArray(parsed.items)) {
      return { statusCode: 422, headers, body: JSON.stringify({
        error: 'El JSON generado no tiene la estructura correcta. Intenta de nuevo o usa el modo manual.',
        rawResponse: clean.substring(0, 2000)
      })};
    }

    return { statusCode: 200, headers, body: JSON.stringify({ success: true, acta: parsed }) };

  } catch (e) {
    console.error('Processing error:', e);
    return { statusCode: 500, headers, body: JSON.stringify({ error: `Error: ${e.message}` }) };
  }
};
