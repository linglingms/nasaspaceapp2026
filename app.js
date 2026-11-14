const scenarios = {
  conventional: {
    name: "Conventional rotation",
    moisture: "0.15",
    meter: 50,
    health: "At risk",
    resilience: "Low",
    recommendation: "Baseline",
    tone: "neutral",
  },
  "cover-crops": {
    name: "Rotation + cover crops",
    moisture: "0.19",
    meter: 76,
    health: "Stable",
    resilience: "Higher",
    recommendation: "Best illustrative outcome",
    tone: "",
  },
  alternative: {
    name: "Alternative cover crop mix",
    moisture: "0.18",
    meter: 68,
    health: "Stable",
    resilience: "Moderate",
    recommendation: "Promising alternative",
    tone: "",
  },
};

const elements = {
  name: document.querySelector("#selected-strategy"),
  moisture: document.querySelector("#moisture-value"),
  meter: document.querySelector("#moisture-meter"),
  health: document.querySelector("#health-value"),
  resilience: document.querySelector("#resilience-value"),
  recommendation: document.querySelector("#recommendation"),
};

function selectScenario(key) {
  const scenario = scenarios[key];
  elements.name.textContent = scenario.name;
  elements.moisture.textContent = scenario.moisture;
  elements.meter.style.width = `${scenario.meter}%`;
  elements.health.textContent = scenario.health;
  elements.resilience.textContent = scenario.resilience;
  elements.recommendation.textContent = scenario.recommendation;
  elements.recommendation.className = `recommendation ${scenario.tone}`;

  document.querySelectorAll(".strategy").forEach((button) => {
    button.classList.toggle("active", button.dataset.strategy === key);
  });
}

document.querySelectorAll(".strategy").forEach((button) => {
  button.addEventListener("click", () => selectScenario(button.dataset.strategy));
});

const areas = {
  "great-plains": {
    name: "Great Plains, USA",
    description: "A dryland grain region used to demonstrate drought-aware rotation planning.",
    crops: "Wheat · Corn · Sorghum",
    terrain: "Prairie · Rolling plains",
    focus: "Water conservation",
    coordinates: [39.5, -101.5],
    zoom: 5,
  },
  "central-valley": {
    name: "Central Valley, USA",
    description: "A productive agricultural valley used to explore water and heat stress tradeoffs.",
    crops: "Rice · Almonds · Tomatoes",
    terrain: "Irrigated valley · Alluvial soils",
    focus: "Water availability",
    coordinates: [37.1, -121.9],
    zoom: 7,
  },
  "east-africa": {
    name: "East Africa",
    description: "A mixed smallholder landscape used to explore rainfall variability and soil health.",
    crops: "Maize · Beans · Sorghum",
    terrain: "Highlands · Semi-arid plains",
    focus: "Rainfall resilience",
    coordinates: [0.3, 36.8],
    zoom: 5,
  },
};

const areaElements = {
  name: document.querySelector("#area-panel-name"),
  description: document.querySelector("#area-panel-description"),
  crops: document.querySelector("#area-crops"),
  terrain: document.querySelector("#area-terrain"),
  focus: document.querySelector("#area-focus"),
  heroName: document.querySelector("#selected-area-name"),
  status: document.querySelector("#area-selection-status"),
};

let selectedAreaKey = "great-plains";
const areaLayers = {};
const farmMap = L.map("farm-map", { scrollWheelZoom: false }).setView(
  areas[selectedAreaKey].coordinates,
  areas[selectedAreaKey].zoom,
);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  maxZoom: 18,
}).addTo(farmMap);

function selectArea(key, moveMap = true) {
  const area = areas[key];
  if (!area) return;
  selectedAreaKey = key;
  areaElements.name.textContent = area.name;
  areaElements.description.textContent = area.description;
  areaElements.crops.textContent = area.crops;
  areaElements.terrain.textContent = area.terrain;
  areaElements.focus.textContent = area.focus;
  areaElements.heroName.textContent = area.name;
  areaElements.status.textContent = "Ready to explore this placeholder area.";

  document.querySelectorAll(".area-option").forEach((button) => {
    button.classList.toggle("active", button.dataset.area === key);
  });
  Object.entries(areaLayers).forEach(([areaKey, layer]) => {
    layer.setStyle({ fillOpacity: areaKey === key ? 0.3 : 0.12, weight: areaKey === key ? 3 : 1 });
  });
  if (moveMap) farmMap.flyTo(area.coordinates, area.zoom, { duration: 0.7 });
}

Object.entries(areas).forEach(([key, area]) => {
  const layer = L.circle(area.coordinates, {
    color: "#1d7a50",
    fillColor: "#69b88b",
    fillOpacity: key === selectedAreaKey ? 0.3 : 0.12,
    radius: 80000,
    weight: key === selectedAreaKey ? 3 : 1,
  }).addTo(farmMap);
  layer.bindTooltip(area.name);
  layer.on("click", () => selectArea(key));
  areaLayers[key] = layer;
});

document.querySelectorAll(".area-option").forEach((button) => {
  button.addEventListener("click", () => selectArea(button.dataset.area));
});

document.querySelector("#use-area").addEventListener("click", () => {
  areaElements.status.textContent = `${areas[selectedAreaKey].name} is now the focus for the next analysis.`;
  document.querySelector("#simulator").scrollIntoView({ behavior: "smooth" });
});
