// Adjustable challenge settings.
// PANORAMA_PATH must match the generated asset folder from scripts/build_panorama.py.
const PANORAMA_PATH = "/assets/panorama";

// Correct guess target in decimal degrees: [latitude, longitude].
const TARGET = [43.4509942, -79.6940503];

// Accepted distance from TARGET, in metres.
const SUCCESS_METERS = 25;

// Pannellum view / zoom options.
const INITIAL_HFOV = 88;
const MIN_HFOV = 12;
const MAX_HFOV = 110;

// Leaflet map options for the guess overlay.
const MAP_START = [20, 0];
const MAP_START_ZOOM = 2;
const MAP_MAX_ZOOM = 19;

// Result strings shown after checking a guess.
const CORRECT_TEXT = "sike";
const WRONG_TEXT = "wrong";

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
  const check = document.querySelector("#checkGuess");
  const result = document.querySelector("#guessResult");
  let map;
  let marker;
  let selected;

  toggle.addEventListener("click", () => {
    panel.classList.toggle("is-open");

    if (!map) {
      map = L.map("guessMap", { worldCopyJump: true }).setView(MAP_START, MAP_START_ZOOM);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: MAP_MAX_ZOOM,
        attribution: ""
      }).addTo(map);

      map.on("click", (event) => {
        selected = event.latlng;
        result.textContent = "";

        if (marker) {
          marker.setLatLng(selected);
        } else {
          marker = L.circleMarker(selected, {
            radius: 7,
            color: "#ffffff",
            fillColor: "#ffffff",
            fillOpacity: 0.85,
            weight: 2
          }).addTo(map);
        }
      });
    }

    window.setTimeout(() => map.invalidateSize(), 0);
  });

  check.addEventListener("click", () => {
    if (!selected) {
      result.textContent = WRONG_TEXT;
      return;
    }

    result.textContent = distanceMeters(selected, TARGET) <= SUCCESS_METERS ? CORRECT_TEXT : WRONG_TEXT;
  });
}

function distanceMeters(point, target) {
  const radius = 6371008.8;
  const pointLat = toRadians(point.lat);
  const targetLat = toRadians(target[0]);
  const deltaLat = toRadians(target[0] - point.lat);
  const deltaLng = toRadians(target[1] - point.lng);
  const chord = Math.sin(deltaLat / 2) ** 2 + Math.cos(pointLat) * Math.cos(targetLat) * Math.sin(deltaLng / 2) ** 2;

  return 2 * radius * Math.atan2(Math.sqrt(chord), Math.sqrt(1 - chord));
}

function toRadians(value) {
  return value * Math.PI / 180;
}

start().catch((error) => {
  const container = document.querySelector("#panorama");
  container.textContent = error.message;
});
