const NOTES_KEY = "geo-osint-challenge-01-notes";
const ANSWER_TEMPLATE = "lat, lon - road/intersection - city, country - evidence";

const hud = document.querySelector("#viewHud");
const notes = document.querySelector("#notes");
const clearNotes = document.querySelector("#clearNotes");
const copyTemplate = document.querySelector("#copyTemplate");

async function loadViewer() {
  const response = await fetch("/assets/panorama/config.json", { cache: "no-store" });

  if (!response.ok) {
    throw new Error("Panorama configuration is missing. Run python3 scripts/build_panorama.py first.");
  }

  const generatedConfig = await response.json();
  const viewer = pannellum.viewer("panorama", {
    ...generatedConfig,
    title: "GEO-OSINT Challenge 01",
    preview: "/assets/preview.jpg",
    autoLoad: true,
    showControls: true,
    showZoomCtrl: true,
    showFullscreenCtrl: true,
    mouseZoom: "fullscreenonly",
    keyboardZoom: true,
    compass: false,
    yaw: 134,
    pitch: 2,
    hfov: 88,
    minHfov: 28,
    maxHfov: 110,
    strings: {
      loadButtonLabel: "Load challenge panorama",
      loadingLabel: "Loading high-resolution panorama..."
    }
  });

  const updateHud = () => {
    hud.textContent = `yaw ${viewer.getYaw().toFixed(1)} | pitch ${viewer.getPitch().toFixed(1)} | zoom ${viewer.getHfov().toFixed(1)}`;
  };

  viewer.on("load", updateHud);
  viewer.on("animatefinished", updateHud);
  viewer.on("zoomchange", updateHud);
  window.setInterval(updateHud, 650);
}

function setupNotes() {
  notes.value = window.localStorage.getItem(NOTES_KEY) || "";

  notes.addEventListener("input", () => {
    window.localStorage.setItem(NOTES_KEY, notes.value);
  });

  clearNotes.addEventListener("click", () => {
    notes.value = "";
    window.localStorage.removeItem(NOTES_KEY);
    notes.focus();
  });

  copyTemplate.addEventListener("click", async () => {
    await navigator.clipboard.writeText(ANSWER_TEMPLATE);
    copyTemplate.textContent = "Copied";
    window.setTimeout(() => {
      copyTemplate.textContent = "Copy template";
    }, 1200);
  });
}

setupNotes();
loadViewer().catch((error) => {
  const container = document.querySelector("#panorama");
  container.innerHTML = `<div class="no-script">${error.message}</div>`;
});
