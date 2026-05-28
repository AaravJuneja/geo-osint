async function loadViewer() {
  const response = await fetch("/assets/panorama/config.json", { cache: "no-store" });

  if (!response.ok) {
    throw new Error("");
  }

  const generatedConfig = await response.json();
  pannellum.viewer("panorama", {
    ...generatedConfig,
    preview: "/assets/preview.jpg",
    autoLoad: true,
    showControls: true,
    showZoomCtrl: true,
    showFullscreenCtrl: true,
    mouseZoom: true,
    keyboardZoom: true,
    compass: false,
    yaw: 134,
    pitch: 2,
    hfov: 88,
    minHfov: 12,
    maxHfov: 110
  });
}

loadViewer().catch((error) => {
  const container = document.querySelector("#panorama");
  container.textContent = error.message;
});
