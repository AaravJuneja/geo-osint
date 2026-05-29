const PANORAMA_PATH = "/assets/panorama";
const INITIAL_HFOV = 88;
const MIN_HFOV = 12;
const MAX_HFOV = 110;
const MAP_START = [20, 0];
const MAP_START_ZOOM = 2;
const MAP_GUESS_ZOOM = 17;
const MAP_MAX_ZOOM = 19;

async function start() {
  setupGuess();

  const response = await fetch(`${PANORAMA_PATH}/config.json`, { cache: "no-store" });

  if (!response.ok) {
    throw new Error("");
  }

  const { startYaw, startPitch, ...generatedConfig } = await response.json();
  pannellum.viewer("panorama", {
    ...generatedConfig,
    preview: `${PANORAMA_PATH}/preview.jpg`,
    autoLoad: true,
    showControls: true,
    showZoomCtrl: true,
    showFullscreenCtrl: true,
    mouseZoom: true,
    keyboardZoom: true,
    compass: false,
    yaw: startYaw,
    pitch: startPitch,
    hfov: INITIAL_HFOV,
    minHfov: MIN_HFOV,
    maxHfov: MAX_HFOV
  });
}

function setupGuess() {
  const panel = document.querySelector("#guessPanel");
  const toggle = document.querySelector("#guessToggle");
  const form = document.querySelector("#guessForm");
  const submit = document.querySelector("#checkGuess");
  const latitude = document.querySelector("#latitudeInput");
  const longitude = document.querySelector("#longitudeInput");
  const result = document.querySelector("#guessResult");
  let map;
  let marker;

  toggle.addEventListener("click", () => {
    panel.classList.toggle("is-open");
    result.textContent = "";
    result.dataset.state = "";

    if (panel.classList.contains("is-open")) {
      ensureMap();
      updateMapPreview();
      window.setTimeout(() => map.invalidateSize(), 0);
    }
  });

  latitude.addEventListener("input", updateMapPreview);
  longitude.addEventListener("input", updateMapPreview);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const lat = Number(latitude.value);
    const lng = Number(longitude.value);

    result.dataset.state = "";

    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      result.textContent = "Enter valid coordinates.";
      return;
    }

    submit.disabled = true;
    result.textContent = "Checking...";

    try {
      const response = await fetch("/api/guess", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat, lng })
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Request failed.");
      }

      if (data.ok) {
        result.dataset.state = "success";
        result.textContent = data.flag;
      } else {
        result.dataset.state = "fail";
        result.textContent = data.message || "No match.";
      }
    } catch (error) {
      result.dataset.state = "fail";
      result.textContent = error.message || "Try again later.";
    } finally {
      submit.disabled = false;
    }
  });

  function ensureMap() {
    if (map) {
      return;
    }

    map = L.map("coordinateMap", { zoomControl: false }).setView(MAP_START, MAP_START_ZOOM);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: MAP_MAX_ZOOM,
      attribution: ""
    }).addTo(map);
  }

  function updateMapPreview() {
    if (!panel.classList.contains("is-open")) {
      return;
    }

    ensureMap();

    const lat = Number(latitude.value);
    const lng = Number(longitude.value);

    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return;
    }

    const point = [lat, lng];
    map.setView(point, MAP_GUESS_ZOOM, { animate: true });

    if (marker) {
      marker.setLatLng(point);
    } else {
      marker = L.circleMarker(point, {
        radius: 7,
        color: "#ffffff",
        fillColor: "#ffffff",
        fillOpacity: 0.9,
        weight: 2
      }).addTo(map);
    }
  }
}

start().catch((error) => {
  const container = document.querySelector("#panorama");
  container.textContent = error.message;
});
