// Netlify function: saves actas.json and optional original file to GitHub

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Método no permitido' }) };

  const { GITHUB_TOKEN, GITHUB_REPO, ADMIN_PASSWORD } = process.env;
  if (!GITHUB_TOKEN || !GITHUB_REPO) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Falta GITHUB_TOKEN o GITHUB_REPO en las variables de entorno.' }) };
  }

  let body;
  try { body = JSON.parse(event.body); } catch (e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'JSON inválido.' }) };
  }

  if (body.password !== ADMIN_PASSWORD) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Contraseña incorrecta.' }) };
  }

  if (!Array.isArray(body.actas)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: '"actas" debe ser un array.' }) };
  }

  const githubHeaders = {
    'Authorization': `Bearer ${GITHUB_TOKEN}`,
    'Accept': 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
    'User-Agent': 'CPA-INAOE-Buscador'
  };

  // Detect branch
  let branch = 'main';
  try {
    const branchResp = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/branches/main`, { headers: githubHeaders });
    if (!branchResp.ok) branch = 'master';
  } catch (e) {}

  try {
    // Step 1: Upload original file if provided
    if (body.fileData && body.fileName) {
      const filePath = `public/data/archivos/${body.fileName}`;
      const fileApi = `https://api.github.com/repos/${GITHUB_REPO}/contents/${filePath}`;

      let fileSha = null;
      const existResp = await fetch(fileApi, { headers: githubHeaders });
      if (existResp.ok) {
        const existData = await existResp.json();
        fileSha = existData.sha;
      }

      const fileCommit = { message: `Subir acta: ${body.fileName}`, content: body.fileData, branch };
      if (fileSha) fileCommit.sha = fileSha;

      const filePut = await fetch(fileApi, {
        method: 'PUT', headers: githubHeaders,
        body: JSON.stringify(fileCommit)
      });

      if (!filePut.ok) {
        const err = await filePut.json().catch(() => ({}));
        console.error('GitHub file upload error:', err);
      }
    }

    // Step 2: Update actas.json
    const jsonApi = `https://api.github.com/repos/${GITHUB_REPO}/contents/public/data/actas.json`;

    let jsonSha = null;
    const getResp = await fetch(jsonApi, { headers: githubHeaders });
    if (getResp.ok) {
      const fileData = await getResp.json();
      jsonSha = fileData.sha;
    }

    const encoded = Buffer.from(JSON.stringify(body.actas, null, 2)).toString('base64');
    const commitBody = {
      message: body.commitMessage || `Actualizar actas — ${new Date().toISOString().slice(0, 10)}`,
      content: encoded, branch
    };
    if (jsonSha) commitBody.sha = jsonSha;

    const putResp = await fetch(jsonApi, {
      method: 'PUT', headers: githubHeaders,
      body: JSON.stringify(commitBody)
    });

    if (!putResp.ok) {
      const err = await putResp.json().catch(() => ({}));
      return { statusCode: 500, headers, body: JSON.stringify({ error: `Error GitHub: ${err.message}` }) };
    }

    return {
      statusCode: 200, headers,
      body: JSON.stringify({ success: true, message: 'Actas actualizadas. El sitio se reconstruirá en ~1 minuto.' })
    };
  } catch (e) {
    console.error('Function error:', e);
    return { statusCode: 500, headers, body: JSON.stringify({ error: `Error: ${e.message}` }) };
  }
};
