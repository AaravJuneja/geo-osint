export default async function handler(req, res) {
  setNoStore(res);

  if (req.method === "OPTIONS") {
    return sendJson(res, 204, null);
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { ok: false, message: "Method not allowed." });
  }

  const config = getConfig();
  if (!config.ok) {
    return sendJson(res, 503, { ok: false, message: "Challenge is not configured." });
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    return sendJson(res, 400, { ok: false, message: "Invalid request." });
  }

  const lat = Number(body.lat);
  const lng = Number(body.lng);

  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return sendJson(res, 400, { ok: false, message: "Invalid coordinates." });
  }

  const distance = distanceMeters(lat, lng, config.targetLat, config.targetLng);

  if (distance <= config.radiusMeters) {
    return sendJson(res, 200, {
      ok: true,
      answer: config.answer,
      message: config.successMessage || config.answer
    });
  }

  return sendJson(res, 200, { ok: false, message: "Incorrect." });
};

function getConfig() {
  const targetLat = Number(process.env.CHALLENGE_TARGET_LAT);
  const targetLng = Number(process.env.CHALLENGE_TARGET_LNG);
  const radiusMeters = Number(process.env.CHALLENGE_RADIUS_METERS || "25");
  const answer = process.env.CHALLENGE_ANSWER;
  const successMessage = process.env.CHALLENGE_SUCCESS_MESSAGE;

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
    successMessage
  };
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === "object") {
    return req.body;
  }

  if (typeof req.body === "string") {
    return JSON.parse(req.body || "{}");
  }

  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (Buffer.byteLength(raw) > 4096) {
      throw new Error("Payload too large");
    }
  }

  return raw ? JSON.parse(raw) : {};
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
  return value * Math.PI / 180;
}

function setNoStore(res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
}

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  if (payload === null) {
    return res.end();
  }
  return res.end(JSON.stringify(payload));
}
