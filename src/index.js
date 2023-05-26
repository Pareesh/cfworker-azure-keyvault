/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run "npm run dev" in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run "npm run deploy" to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

function isValidRequest(request) {
  // @todo add validation to avoid unauthorized access.
  return true;
}

function getResponse(body, status, headers = new Headers()) {
  return new Response(body, { status, headers });
}

function getOptionsResponseHeaders() {
  const headers = new Headers();
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET, POST");
  headers.set("Access-Control-Allow-Headers", "access-control-allow-headers, Content-Type");
  headers.set("Access-Control-Max-Age", "86400");
  return headers;
}

function getSecretsFromData(data) {
  const secret = Object.values(data)[0];
  const key = "secret" + Date.now() + "";
  // @todo get secret keys and values from data, there can be multiple,
  // for now the first data value is considered secret nad key randomly generated.
  console.log(key);
  return [{
    "name": key,
    "value": secret
  }];
}

async function getAccessToken(env) {
  const DirectoryId = env.azureDirectoryId;
  const appId = env.azureAppClientId;
  const appSecret = env.azureAppSecret;

  const formData = new FormData();
  formData.append("grant_type", "client_credentials");
  formData.append("client_id", appId);
  formData.append("client_secret", appSecret);
  formData.append("scope", "https://vault.azure.net/.default");
  const url = `https://login.microsoftonline.com/${DirectoryId}/oauth2/v2.0/token`;
  const response = await fetch(url, {
    body: formData,
    method: "POST"
  });
  const json = await response.json();
  return json.access_token;
}

async function handleGET(request, env) {
  let secretKey;
  try {
    const data = await request.json();
    secretKey = data.key;
  } catch (err) {
    // secretKey = 'secret';
    return getResponse("Key not specified", 400);
  }
  const accessToken = await getAccessToken(env);
  const url = `https://franklin.vault.azure.net/secrets/${secretKey}?api-version=7.4`;
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Authorization": "Bearer " + accessToken
    }
  });
  const data = await response.json();
  return getResponse(JSON.stringify({'value': data.value}), 200);
}

async function handlePOST(request, env) {
  const data = await request.json();
  const secrets = getSecretsFromData(data);
  const accessToken = await getAccessToken(env);
  for (let i = 0; i < secrets.length; i++) {
    const secretObj = secrets[i];
    const url = `https://franklin.vault.azure.net/secrets/${secretObj.name}?api-version=7.4`;
    const response = await fetch(url, {
      method: "PUT",
      headers: {
        "Authorization": "Bearer " + accessToken,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ "value": secretObj.value })
    });
    // @todo add validation for all secret submission based on response status code.
  }
  // @todo forward the submission to excel.
  return getResponse("Submitted Successfully", 200);
}

async function onRequest(request, env, ctx) {
  const isValid = isValidRequest(request);
  try {
    if (!isValid) {
      return getResponse("Invalid request", 404, new Headers());
    }
    const requestMethod = request.method;
    if (requestMethod === "OPTIONS") {
      return getResponse("", 200, getOptionsResponseHeaders());
    }
    if (requestMethod === "GET") {
      return handleGET(request, env);
    }
    if (requestMethod === "POST") {
      return handlePOST(request, env);
    }
  } catch (err) {
    console.error(err);
    return getResponse(err.stack, 500, new Headers());
  }
}

export default {
  fetch: onRequest
};