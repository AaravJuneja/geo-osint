const MAX_BODY_BYTES = 4096;
const JSON_CONTENT_TYPE = /^\s*application\/json(?:;|$)/i;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/guess") {
      return handleGuess(request, env);
    }

    return env.ASSETS.fetch(request);
  },
};

async function handleGuess(request, env) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: baseHeaders() });
  }

  if (request.method !== "POST") {
    return json({ ok: false, message: "Method not allowed." }, 405, { Allow: "POST" });
  }

  const config = getConfig(env);
  if (!config.ok) {
    return json({ ok: false, message: "Challenge is not configured." }, 503);
  }

  let body;
  try {
    body = await readJsonBody(request);
  } catch {
    return json({ ok: false, message: "Invalid request." }, 400);
  }

  const lat = Number(body.lat);
  const lng = Number(body.lng);

  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return json({ ok: false, message: "Invalid coordinates." }, 400);
  }

  const distance = distanceMeters(lat, lng, config.targetLat, config.targetLng);

  if (distance <= config.radiusMeters) {
    return json({
      ok: true,
      answer: config.answer,
      message: config.successMessage || config.answer,
    });
  }

  return json({ ok: false, message: "Incorrect." });
}

function getConfig(env) {
  const source = env && typeof env === "object" ? env : {};
  const targetLat = Number(source.CHALLENGE_TARGET_LAT);
  const targetLng = Number(source.CHALLENGE_TARGET_LNG);
  const radiusMeters = Number(source.CHALLENGE_RADIUS_METERS || "25");
  const answer = typeof source.CHALLENGE_ANSWER === "string" ? source.CHALLENGE_ANSWER.trim() : "";
  const successMessage =
    typeof source.CHALLENGE_SUCCESS_MESSAGE === "string" ? source.CHALLENGE_SUCCESS_MESSAGE.trim() : "";

  return {
    ok:
      Number.isFinite(targetLat) &&
      Number.isFinite(targetLng) &&
      targetLat >= -90 &&
      targetLat <= 90 &&
      targetLng >= -180 &&
      targetLng <= 180 &&
      Number.isFinite(radiusMeters) &&
      radiusMeters > 0 &&
      typeof answer === "string" &&
      answer.length > 0,
    targetLat,
    targetLng,
    radiusMeters,
    answer,
    successMessage,
  };
}

async function readJsonBody(request) {
  const contentType = request.headers.get("content-type");
  if (typeof contentType === "string" && contentType.length > 0 && !JSON_CONTENT_TYPE.test(contentType)) {
    throw new Error("Unsupported content type");
  }

  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) {
    throw new Error("Payload too large");
  }

  return parseJsonObject(raw);
}

function parseJsonObject(raw) {
  const payload = raw ? JSON.parse(raw) : {};
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Invalid JSON payload");
  }
  return payload;
}

function distanceMeters(lat, lng, targetLat, targetLng) {
  const radius = 6371008.8;
  const lat1 = toRadians(lat);
  const lat2 = toRadians(targetLat);
  const deltaLat = toRadians(targetLat - lat);
  const deltaLng = toRadians(targetLng - lng);
  const chord = Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;

  return 2 * radius * Math.atan2(Math.sqrt(chord), Math.sqrt(1 - chord));
}

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function baseHeaders() {
  return {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
    "X-Robots-Tag": "noindex, nofollow",
    "Cross-Origin-Resource-Policy": "same-origin",
  };
}

function json(payload, status = 200, extra = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...baseHeaders(), ...extra },
  });
}
