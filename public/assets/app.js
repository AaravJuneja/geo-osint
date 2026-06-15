async function start() {
  setupGuess();

  const response = await fetch("/assets/panorama/config.json");

  if (!response.ok) {
    throw new Error("Failed to load panorama configuration");
  }

  const { startYaw, startPitch, ...generatedConfig } = await response.json();
  pannellum.viewer("panorama", {
    ...generatedConfig,
    preview: "/assets/panorama/preview.jpg",
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
  let leafletLoad;

  toggle.addEventListener("click", async () => {
    panel.classList.toggle("is-open");
    result.textContent = "";
    result.dataset.state = "";

    if (panel.classList.contains("is-open")) {
      try {
        await ensureMap();
        updateMapPreview();
        window.setTimeout(() => map.invalidateSize(), 0);
      } catch {
        result.dataset.state = "fail";
        result.textContent = "Map preview unavailable.";
      }
    }
  });

  latitude.addEventListener("input", () => {
    updateMapPreview();
  });
  longitude.addEventListener("input", () => {
    updateMapPreview();
  });

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

      if (!response.ok) {
        let message = "Request failed.";
        try {
          const errorData = await response.json();
          message = errorData.message || message;
        } catch {}
        throw new Error(message);
      }

      const data = await response.json();

      if (data.ok) {
        result.dataset.state = "success";
        result.textContent = data.flag;
      } else {
        result.dataset.state = "fail";
        result.textContent = data.message || "Incorrect.";
      }
    } catch (error) {
      result.dataset.state = "fail";
      result.textContent = error.message || "Try again later.";
    } finally {
      submit.disabled = false;
    }
  });

  async function ensureMap() {
    if (map) {
      return;
    }

    await ensureLeaflet();

    map = L.map("coordinateMap", { zoomControl: false }).setView([20, 0], 2);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: ""
    }).addTo(map);
  }

  function ensureLeaflet() {
    if (window.L) {
      return Promise.resolve();
    }

    if (leafletLoad) {
      return leafletLoad;
    }

    if (!document.querySelector("link[data-leaflet-css]")) {
      const stylesheet = document.createElement("link");
      stylesheet.rel = "stylesheet";
      stylesheet.href = "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css";
      stylesheet.dataset.leafletCss = "true";
      document.head.append(stylesheet);
    }

    leafletLoad = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js";
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Leaflet failed to load"));
      document.body.append(script);
    });

    return leafletLoad;
  }

  async function updateMapPreview() {
    if (!panel.classList.contains("is-open")) {
      return;
    }

    const lat = Number(latitude.value);
    const lng = Number(longitude.value);

    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return;
    }

    try {
      await ensureMap();
    } catch {
      return;
    }

    const point = [lat, lng];
    map.setView(point, 17, { animate: true });

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
