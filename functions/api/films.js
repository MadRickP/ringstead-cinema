const ADMIN_EMAIL = "rick@prestonmail.co.uk";
const SITE_ORIGIN = "https://ringstead-cinema.pages.dev";
const GITHUB_REPOSITORY = "MadRickP/ringstead-cinema";
const GITHUB_BRANCH = "main";
const FILMS_PATH = "films.json";

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
  return request.headers.get("Origin") === SITE_ORIGIN;
}

async function authorisedUser(request, env) {
  const header = request.headers.get("Authorization") || "";
  if (!header.startsWith("Bearer ")) return null;

  const token = header.slice(7);
  if (!token || !env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return null;

  const result = await fetch(env.SUPABASE_URL + "/auth/v1/user", {
    headers: {
      "apikey": env.SUPABASE_ANON_KEY,
      "Authorization": "Bearer " + token
    }
  });

  if (!result.ok) return null;
  const user = await result.json();
  if (String(user.email || "").toLowerCase() !== ADMIN_EMAIL) return null;
  return user;
}

async function githubRequest(env, method, body) {
  if (!env.GITHUB_TOKEN) {
    return { ok: false, status: 503, message: "The GitHub access secret has not been configured in Cloudflare yet." };
  }

  const url = "https://api.github.com/repos/" + GITHUB_REPOSITORY +
    "/contents/" + FILMS_PATH;

  const result = await fetch(url, {
    method,
    headers: {
      "Accept": "application/vnd.github+json",
      "Authorization": "Bearer " + env.GITHUB_TOKEN,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "Ringstead-Cinema-Film-Admin",
      ...(body ? { "Content-Type": "application/json" } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });

  return result;
}

function decodeBase64(value) {
  const binary = atob(value.replace(/\n/g, ""));
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function encodeBase64(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function validateFilmData(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return "The JSON must contain an object at the top level.";
  }
  if (!data.current || typeof data.current !== "object" || Array.isArray(data.current)) {
    return 'A "current" film object is required.';
  }
  if (!data.comingSoon || typeof data.comingSoon !== "object" || Array.isArray(data.comingSoon)) {
    return 'A "comingSoon" film object is required.';
  }
  if (!Array.isArray(data.previousScreenings)) {
    return 'A "previousScreenings" array is required.';
  }

  for (const [label, film] of [["Current", data.current], ["Coming soon", data.comingSoon]]) {
    for (const field of ["id", "title", "screeningDate", "screeningTime", "synopsis"]) {
      if (typeof film[field] !== "string" || !film[field].trim()) {
        return label + " film: " + field + " must be a non-empty string.";
      }
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(film.screeningDate)) {
      return label + " film: screeningDate must use YYYY-MM-DD.";
    }
  }

  for (let i = 0; i < data.previousScreenings.length; i++) {
    const film = data.previousScreenings[i];
    if (!film || typeof film !== "object" || Array.isArray(film)) {
      return "Previous screening " + (i + 1) + " must be an object.";
    }
    for (const field of ["id", "title", "screeningDate", "month"]) {
      if (typeof film[field] !== "string" || !film[field].trim()) {
        return "Previous screening " + (i + 1) + ": " + field + " must be a non-empty string.";
      }
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(film.screeningDate)) {
      return "Previous screening " + (i + 1) + ": screeningDate must use YYYY-MM-DD.";
    }
  }

  return null;
}

export async function onRequestGet({ request, env }) {
  if (!allowedOrigin(request)) return response({ error: "Origin not allowed." }, 403);

  const user = await authorisedUser(request, env);
  if (!user) return response({ error: "Your admin session is invalid or not authorised. Please sign in again." }, 401);

  const result = await githubRequest(env, "GET");
  if (!result.ok) {
    const detail = await result.json().catch(() => ({}));
    return response({
      error: result.status === 404
        ? "films.json could not be found in the GitHub repository."
        : "Unable to read films.json from GitHub.",
      detail: detail.message || result.statusText
    }, result.status === 404 ? 404 : 502);
  }

  const file = await result.json();
  return response({
    content: decodeBase64(file.content || ""),
    sha: file.sha,
    path: FILMS_PATH
  });
}

export async function onRequestPost({ request, env }) {
  if (!allowedOrigin(request)) return response({ error: "Origin not allowed." }, 403);

  const user = await authorisedUser(request, env);
  if (!user) return response({ error: "Your admin session is invalid or not authorised. Please sign in again." }, 401);

  let payload;
  try {
    const raw = await request.text();
    if (raw.length > 250000) return response({ error: "The film data is too large to save." }, 413);
    payload = JSON.parse(raw);
  } catch {
    return response({ error: "The save request was not valid JSON." }, 400);
  }

  if (typeof payload.content !== "string" || typeof payload.sha !== "string") {
    return response({ error: "The save request is missing the film data or its version identifier." }, 400);
  }

  let data;
  try {
    data = JSON.parse(payload.content);
  } catch {
    return response({ error: "The film data is not valid JSON. Correct it before saving." }, 400);
  }

  const validationError = validateFilmData(data);
  if (validationError) return response({ error: validationError }, 400);

  const latest = await githubRequest(env, "GET");
  if (!latest.ok) return response({ error: "Could not check the current GitHub version before saving." }, 502);
  const latestFile = await latest.json();

  if (latestFile.sha !== payload.sha) {
    return response({
      error: "films.json has changed on GitHub since you loaded it. Reload the latest version before saving to avoid overwriting someone else's changes."
    }, 409);
  }

  const update = await githubRequest(env, "PUT", {
    message: "Update cinema film information",
    content: encodeBase64(payload.content),
    sha: latestFile.sha,
    branch: GITHUB_BRANCH
  });

  if (!update.ok) {
    const detail = await update.json().catch(() => ({}));
    return response({
      error: "GitHub did not accept the film data update.",
      detail: detail.message || update.statusText
    }, 502);
  }

  const saved = await update.json();
  return response({
    success: true,
    sha: saved.content?.sha || null,
    commit: saved.commit?.sha || null
  });
}
