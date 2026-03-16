// Netlify serverless function: saves updated actas.json to GitHub repo
// This triggers a Netlify redeploy so all users see the updated data

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Método no permitido' }) };
  }

  // Validate env vars
  const { GITHUB_TOKEN, GITHUB_REPO, ADMIN_PASSWORD } = process.env;
  if (!GITHUB_TOKEN || !GITHUB_REPO) {
    return {
      statusCode: 500, headers,
      body: JSON.stringify({ error: 'Configuración del servidor incompleta. Verifica las variables de entorno GITHUB_TOKEN y GITHUB_REPO en Netlify.' })
    };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'JSON inválido en el cuerpo de la petición.' }) };
  }

  // Authenticate
  if (body.password !== ADMIN_PASSWORD) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Contraseña incorrecta.' }) };
  }

  if (!Array.isArray(body.actas)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'El campo "actas" debe ser un array.' }) };
  }

  const filePath = 'public/data/actas.json';
  const apiBase = `https://api.github.com/repos/${GITHUB_REPO}/contents/${filePath}`;
  const githubHeaders = {
    'Authorization': `Bearer ${GITHUB_TOKEN}`,
    'Accept': 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
    'User-Agent': 'CCA-INAOE-Buscador'
  };

  try {
    // Step 1: Get current file SHA (required for updates)
    let sha = null;
    const getResp = await fetch(apiBase, { headers: githubHeaders });
    if (getResp.ok) {
      const fileData = await getResp.json();
      sha = fileData.sha;
    }
    // If file doesn't exist (404), sha stays null and we create it

    // Step 2: Encode new content
    const newContent = JSON.stringify(body.actas, null, 2);
    const encoded = Buffer.from(newContent).toString('base64');

    // Step 3: Commit the update
    const commitBody = {
      message: body.commitMessage || `Actualizar actas — ${new Date().toISOString().slice(0, 10)}`,
      content: encoded,
      branch: 'main'
    };
    if (sha) commitBody.sha = sha;

    const putResp = await fetch(apiBase, {
      method: 'PUT',
      headers: githubHeaders,
      body: JSON.stringify(commitBody)
    });

    if (!putResp.ok) {
      const err = await putResp.json();
      console.error('GitHub API error:', err);
      
      // Try 'master' branch if 'main' fails
      if (err.message && err.message.includes('branch')) {
        commitBody.branch = 'master';
        const retryResp = await fetch(apiBase, {
          method: 'PUT',
          headers: githubHeaders,
          body: JSON.stringify(commitBody)
        });
        if (retryResp.ok) {
          return {
            statusCode: 200, headers,
            body: JSON.stringify({ success: true, message: 'Actas actualizadas. El sitio se reconstruirá en ~1 minuto.' })
          };
        }
        const retryErr = await retryResp.json();
        return {
          statusCode: 500, headers,
          body: JSON.stringify({ error: `Error de GitHub: ${retryErr.message}` })
        };
      }
      
      return {
        statusCode: 500, headers,
        body: JSON.stringify({ error: `Error de GitHub: ${err.message}` })
      };
    }

    return {
      statusCode: 200, headers,
      body: JSON.stringify({ success: true, message: 'Actas actualizadas. El sitio se reconstruirá en ~1 minuto.' })
    };

  } catch (e) {
    console.error('Function error:', e);
    return {
      statusCode: 500, headers,
      body: JSON.stringify({ error: `Error del servidor: ${e.message}` })
    };
  }
};
