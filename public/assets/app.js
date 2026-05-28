const SCENES = new Set(["v1", "v2", "v3"]);
const TARGETS = {
  v1: [43.4513833, -79.6947129],
  v2: [43.4509942, -79.6940503],
  v3: [43.4509355, -79.6939561]
};
const SUCCESS_METERS = 25;

function currentScene() {
  const scene = window.location.pathname.split("/").filter(Boolean)[0];
  return SCENES.has(scene) ? scene : "v1";
}

function markCurrent(scene) {
  document.querySelectorAll("[data-scene]").forEach((link) => {
    if (link.dataset.scene === scene) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  });
}

async function start() {
  const scene = currentScene();
  markCurrent(scene);
  setupGuess(scene);

  const response = await fetch(`/assets/panoramas/${scene}/config.json`, { cache: "no-store" });

  if (!response.ok) {
    throw new Error("");
  }

  const { startYaw, startPitch, ...generatedConfig } = await response.json();
  pannellum.viewer("panorama", {
    ...generatedConfig,
    preview: `/assets/panoramas/${scene}/preview.jpg`,
    autoLoad: true,
    showControls: true,
    showZoomCtrl: true,
    showFullscreenCtrl: true,
    mouseZoom: true,
    keyboardZoom: true,
    compass: false,
    yaw: startYaw,
    pitch: startPitch,
    hfov: 88,
    minHfov: 12,
    maxHfov: 110
  });
}

function setupGuess(scene) {
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
      map = L.map("guessMap", { worldCopyJump: true }).setView([20, 0], 2);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
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
      result.textContent = "wrong";
      return;
    }

    result.textContent = distanceMeters(selected, TARGETS[scene]) <= SUCCESS_METERS ? "sike" : "wrong";
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
