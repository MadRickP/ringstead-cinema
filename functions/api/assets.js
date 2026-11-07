const ADMIN_EMAIL = "rick@prestonmail.co.uk";
const SITE_ORIGIN = "https://ringstead-cinema.pages.dev";
const GITHUB_REPOSITORY = "MadRickP/ringstead-cinema";
const GITHUB_BRANCH = "main";
const SUPABASE_URL = "https://tntzppzwkrwohvtpoxvf.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable__QiKh2LA9dtycAE42t1N5A_otDc3pLS";
const MAX_FILE_SIZE = 8 * 1024 * 1024;
const ALLOWED_TYPES = new Map([
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".png", "image/png"],
  [".webp", "image/webp"],
  [".gif", "image/gif"]
]);

function response(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

function allowedOrigin(request) {
  const origin = request.headers.get("Origin");
  if (origin) return origin === SITE_ORIGIN;
  const referer = request.headers.get("Referer") || "";
  return referer.startsWith(SITE_ORIGIN + "/");
}

async function authorisedUser(request) {
  const header = request.headers.get("Authorization") || "";
  if (!header.startsWith("Bearer ")) return null;
  const token = header.slice(7);
  if (!token) return null;

  const result = await fetch(SUPABASE_URL + "/auth/v1/user", {
    headers: {
      "apikey": SUPABASE_ANON_KEY,
      "Authorization": "Bearer " + token
    }
  });
  if (!result.ok) return null;
  const user = await result.json();
  return String(user.email || "").toLowerCase() === ADMIN_EMAIL ? user : null;
}

function encodeBase64(bytes) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

async function githubRequest(env, path, method, body) {
  if (!env.GITHUB_TOKEN) {
    return new Response(JSON.stringify({ message: "The GitHub access secret has not been configured in Cloudflare yet." }), { status: 503 });
  }
  const url = "https://api.github.com/repos/" + GITHUB_REPOSITORY +
    "/contents/" + path;
  return fetch(url, {
    method,
    headers: {
      "Accept": "application/vnd.github+json",
      "Authorization": "Bearer " + env.GITHUB_TOKEN,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "Ringstead-Cinema-Asset-Admin",
      ...(body ? { "Content-Type": "application/json" } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
}

export async function onRequestPost({ request, env }) {
  if (!allowedOrigin(request)) return response({ error: "Origin not allowed." }, 403);
  if (!await authorisedUser(request)) {
    return response({ error: "Your admin session is invalid or not authorised. Please sign in again." }, 401);
  }

  let form;
  try {
    const length = Number(request.headers.get("Content-Length") || 0);
    if (length > MAX_FILE_SIZE + 1024 * 1024) {
      return response({ error: "The image is too large. The maximum file size is 8 MB." }, 413);
    }
    form = await request.formData();
  } catch {
    return response({ error: "The upload request could not be read." }, 400);
  }

  const file = form.get("file");
  if (!file || typeof file.arrayBuffer !== "function" || !file.name) {
    return response({ error: "Choose an image file to upload." }, 400);
  }
  if (file.size <= 0 || file.size > MAX_FILE_SIZE) {
    return response({ error: "The image must be between 1 byte and 8 MB." }, 413);
  }

  const name = file.name;
  if (name.length > 120 || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name) || name === "." || name === "..") {
    return response({ error: "The filename may contain only letters, numbers, dots, hyphens and underscores." }, 400);
  }
  const extension = name.slice(name.lastIndexOf(".")).toLowerCase();
  const expectedType = ALLOWED_TYPES.get(extension);
  if (!expectedType || file.type !== expectedType) {
    return response({ error: "Only JPG, PNG, WebP and GIF image files are accepted." }, 415);
  }

  const path = "assets/" + name;
  const existing = await githubRequest(env, path, "GET");
  if (existing.status === 200) {
    return response({ error: "A file named " + name + " already exists in assets. Rename your new file first; existing files are never overwritten." }, 409);
  }
  if (existing.status !== 404) {
    return response({ error: "GitHub could not check whether this filename is available." }, 502);
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const upload = await githubRequest(env, path, "PUT", {
    message: "Upload cinema asset: " + name,
    content: encodeBase64(bytes),
    branch: GITHUB_BRANCH
  });

  if (!upload.ok) {
    const detail = await upload.json().catch(() => ({}));
    return response({
      error: "GitHub did not accept the image upload: " + (detail.message || upload.statusText)
    }, 502);
  }

  const saved = await upload.json();
  return response({
    success: true,
    path,
    commit: saved.commit?.sha || null
  });
}
