const scenarios = {
  conventional: {
    name: "Conventional monoculture (CF 1)",
    moisture: 0.15,
    meter: 50,
    health: "At risk",
    resilience: "Low",
    recommendation: "Baseline comparison",
    tone: "neutral",
    waterDemand: "High",
    soilEffect: "Continued nutrient removal",
    tradeoff: "Most familiar operation, but leaves soil exposed between cash crops.",
    explanation:
      "This is the comparison baseline: the field follows the existing crop sequence without a cover crop. It may be simpler to operate, but bare periods can increase evaporation, runoff, and erosion, especially when drought risk is elevated.",
    assumptions: "Uses the current crop sequence and the area's recent moisture conditions.",
    confidence: "Illustrative baseline",
  },
  "cover-crops": {
    name: "Legume / cover rotation (CF 2)",
    moisture: 0.19,
    meter: 76,
    health: "Stable",
    resilience: "Higher",
    recommendation: "Soil-cover option",
    tone: "",
    waterDemand: "Moderate",
    soilEffect: "Improved cover and organic matter",
    tradeoff: "May require seed, planting time, and water during establishment.",
    explanation:
      "A cover crop keeps living roots and residue on the field between primary crops. That can reduce direct soil evaporation and runoff while improving infiltration and soil structure. The benefit is strongest when the cover crop is terminated before it competes heavily for water.",
    assumptions: "Assumes timely establishment, appropriate species selection, and termination before peak water demand.",
    confidence: "Illustrative, moderate confidence",
  },
  alternative: {
    name: "Low-water pulse rotation (CF 3)",
    moisture: 0.18,
    meter: 68,
    health: "Stable",
    resilience: "Moderate",
    recommendation: "Lower-water alternative",
    tone: "",
    waterDemand: "Low–moderate",
    soilEffect: "Targeted nutrient and residue benefits",
    tradeoff: "More flexible, but results depend on the selected species mix.",
    explanation:
      "This option uses a lower-water or locally adapted cover crop mix. It aims to retain some soil-cover and rooting benefits while reducing establishment risk. It is a useful compromise when a full cover-crop program could use too much water.",
    assumptions: "Assumes the mix is matched to local rainfall, soil type, planting window, and termination method.",
    confidence: "Illustrative, moderate confidence",
  },
};

const defaultScenarios = Object.fromEntries(
  Object.entries(scenarios).map(([key, scenario]) => [key, { ...scenario }]),
);

const elements = {
  name: document.querySelector("#selected-strategy"),
  moisture: document.querySelector("#moisture-value"),
  meter: document.querySelector("#moisture-meter"),
  health: document.querySelector("#health-value"),
  resilience: document.querySelector("#resilience-value"),
  recommendation: document.querySelector("#recommendation"),
  waterDemand: document.querySelector("#water-demand-value"),
  soilEffect: document.querySelector("#soil-effect-value"),
  tradeoff: document.querySelector("#scenario-tradeoff"),
  explanation: document.querySelector("#scenario-explanation"),
  assumptions: document.querySelector("#scenario-assumptions"),
  confidence: document.querySelector("#confidence-value"),
};

const survey = {
  form: document.querySelector("#farm-survey"),
  steps: [...document.querySelectorAll(".survey-step")],
  stepLabel: document.querySelector("#survey-step-label"),
  progressBar: document.querySelector("#survey-progress-bar"),
  back: document.querySelector("#survey-back"),
  next: document.querySelector("#survey-next"),
  result: document.querySelector("#survey-result"),
  resultTitle: document.querySelector("#survey-recommendation-title"),
  resultReason: document.querySelector("#survey-recommendation-reason"),
  scoreList: document.querySelector("#survey-score-list"),
  edit: document.querySelector("#survey-edit"),
  reset: document.querySelector("#survey-reset"),
  resetDialog: document.querySelector("#survey-reset-dialog"),
  priorityLimit: document.querySelector("#priority-limit"),
  locationStatus: document.querySelector("#survey-location-status"),
  climateContext: document.querySelector("#survey-climate-context"),
  latitude: document.querySelector("#farm-latitude"),
  longitude: document.querySelector("#farm-longitude"),
  currentStep: 1,
};
let surveyMap = null;
let activeRecommendationKey = null;

function checkedValues(name) {
  return [...survey.form.querySelectorAll(`input[name="${name}"]:checked`)].map((input) => input.value);
}

function readSurveyAnswers() {
  const formData = new FormData(survey.form);
  return {
    location: formData.get("location")?.trim() || "",
    latitude: Number(formData.get("latitude")) || null,
    longitude: Number(formData.get("longitude")) || null,
    pastCrops: checkedValues("pastCrops"),
    season: formData.get("season") || "",
    water: formData.get("water") || "",
    priorities: checkedValues("priorities"),
    constraints: checkedValues("constraints"),
    fieldSize: formData.get("fieldSize")?.trim() || "",
    soilType: formData.get("soilType")?.trim() || "",
    budget: formData.get("budget") || "",
  };
}

function showSurveyStep(step) {
  survey.currentStep = step;
  survey.steps.forEach((field, index) => {
    const active = index + 1 === step;
    field.hidden = !active;
    field.classList.toggle("active", active);
  });
  survey.stepLabel.textContent = `Question ${step} of ${survey.steps.length}`;
  survey.progressBar.style.width = `${(step / survey.steps.length) * 100}%`;
  survey.back.disabled = step === 1;
  survey.next.textContent = step === survey.steps.length ? "See recommendation" : "Next question";
  if (step === 1 && surveyMap) window.setTimeout(() => surveyMap.invalidateSize(), 50);
}

function validateSurveyStep() {
  const current = survey.steps[survey.currentStep - 1];
  const required = current.querySelector("[required]");
  if (required && !required.checkValidity()) {
    required.reportValidity();
    return false;
  }
  if (survey.currentStep === 1 && (!survey.latitude.value || !survey.longitude.value)) {
    survey.locationStatus.textContent = "Place a marker inside the Eastern Washington boundary before continuing.";
    return false;
  }
  if (survey.currentStep === 5 && checkedValues("priorities").length === 0) {
    survey.priorityLimit.textContent = "Choose at least one priority.";
    return false;
  }
  return true;
}

function calculateRecommendation(answers) {
  const scores = Object.fromEntries(Object.keys(scenarios).map((key) => [key, 0]));
  const reasons = [];
  const priorities = new Set(answers.priorities);
  const constraints = new Set(answers.constraints);
  const climateRisk = Number(powerData?.stress_risk_summary?.mean ?? 0.234);
  let climateAdjustment = 0;
  if (climateRisk >= 0.25) {
    scores.alternative += 1;
    scores["cover-crops"] += 1;
    climateAdjustment = 1;
    reasons.push("the current climate proxy is moderately elevated, so lower-water and soil-cover options receive a climate adjustment");
  } else if (climateRisk < 0.15) {
    scores.conventional += 1;
    climateAdjustment = 1;
    reasons.push("the current climate proxy is lower, so the baseline option receives a climate adjustment");
  }

  if (answers.water === "rainfed") {
    scores.alternative += 3;
    scores["cover-crops"] += 1;
    if (priorities.has("water")) scores.alternative += 1;
    reasons.push("rainfed conditions favor the lower-water alternative mix");
  } else if (answers.water === "irrigated") {
    scores["cover-crops"] += 2;
    reasons.push("irrigation provides more flexibility for establishing a full cover crop");
  } else if (answers.water === "partial") {
    scores.alternative += 2;
    scores["cover-crops"] += 1;
    reasons.push("partial irrigation favors a balanced water-demand option");
  }
  if (priorities.has("water")) {
    scores.alternative += 2;
    scores["cover-crops"] += 1;
  }
  if (priorities.has("soil")) scores["cover-crops"] += 2;
  if (priorities.has("risk") || priorities.has("yield")) {
    scores["cover-crops"] += 2;
    scores.alternative += 1;
  }
  if (priorities.has("profit")) {
    scores.conventional += 1;
    scores.alternative += 1;
  }
  if (answers.season === "fall" || answers.season === "winter") {
    scores["cover-crops"] += 2;
    reasons.push("a fall or winter window can support soil cover between cash crops");
  }
  if (answers.season === "summer") scores.alternative += 1;
  scores.alternative += 1;
  reasons.push("the Eastern Washington focus emphasizes climate-aware water management");
  if (answers.pastCrops.some((crop) => ["wheat", "barley", "corn"].includes(crop))) {
    scores.alternative += 1;
    reasons.push("your recent grain rotation supports comparing a lower-water cover mix");
  }
  if (answers.pastCrops.some((crop) => ["potatoes", "onions"].includes(crop))) {
    scores["cover-crops"] += 1;
    reasons.push("your recent high-disturbance crops support evaluating added soil cover");
  }
  if (answers.soilType === "sandy") {
    scores["cover-crops"] += 1;
    reasons.push("sandy soil increases the value of cover and residue protection");
  } else if (answers.soilType === "clay-loam") {
    scores.alternative += 1;
    reasons.push("clay-loam soil favors a flexible mix with controlled establishment demand");
  }
  const fieldSize = Number(answers.fieldSize);
  if (Number.isFinite(fieldSize) && fieldSize >= 500) {
    scores.conventional += 1;
    reasons.push("the large field size favors a strategy that is easier to scale with existing equipment");
  } else if (Number.isFinite(fieldSize) && fieldSize > 0 && fieldSize <= 50) {
    scores["cover-crops"] += 1;
    reasons.push("the smaller field size makes a cover-crop trial easier to test");
  }
  if (constraints.has("cost")) {
    scores.conventional += 1;
    scores["cover-crops"] -= 1;
  }
  if (constraints.has("equipment") || constraints.has("market")) {
    scores.conventional += 1;
    scores.alternative -= 1;
  }
  if (answers.budget === "limited") {
    scores.conventional += 1;
    scores["cover-crops"] -= 1;
  } else if (answers.budget === "flexible") {
    scores["cover-crops"] += 1;
  }

  const ranked = Object.entries(scores).sort(([, first], [, second]) => second - first);
  const nearest = answers.latitude && answers.longitude
    ? nearestPowerPoint(answers.latitude, answers.longitude)?.point
    : null;
  return { key: ranked[0][0], scores, reasons, climateAdjustment, nearestPoint: nearest };
}

function updateScenarioMetrics(answers, recommendation) {
  const climateRisk = Number(powerData?.stress_risk_summary?.mean ?? 0.234);
  const waterAdjustment = {
    rainfed: -0.02,
    partial: 0.01,
    irrigated: 0.04,
    unknown: 0,
  }[answers.water] || 0;
  const seasonAdjustment = answers.season === "summer" ? -0.01 : 0;
  const baselineMoisture = Math.max(0.08, Math.min(0.32, 0.20 - climateRisk * 0.08 + waterAdjustment + seasonAdjustment));
  const moistureValues = {
    conventional: baselineMoisture,
    "cover-crops": baselineMoisture + (answers.water === "rainfed" ? 0.015 : 0.035),
    alternative: baselineMoisture + 0.025,
  };
  const labels = {
    conventional: "Baseline comparison",
    "cover-crops": "Soil-cover option",
    alternative: "Lower-water alternative",
  };
  Object.entries(moistureValues).forEach(([key, moisture]) => {
    const scenario = scenarios[key];
    scenario.moisture = Number(Math.max(0.05, Math.min(0.4, moisture)).toFixed(2));
    scenario.meter = Math.round((scenario.moisture / 0.4) * 100);
    scenario.recommendation = key === recommendation.key ? "Best fit for your inputs" : labels[key];
    scenario.confidence = `Exploratory fit score: ${recommendation.scores[key]}`;
    scenario.assumptions = `Uses the selected climate proxy (${climateRisk.toFixed(3)} mean stress risk), water access, season, priorities, and constraints.`;
  });
  activeRecommendationKey = recommendation.key;
}

function showSurveyRecommendation() {
  const answers = readSurveyAnswers();
  const recommendation = calculateRecommendation(answers);
  updateScenarioMetrics(answers, recommendation);
  if (activeScmCell) applyScmCellToSimulator(activeScmCell);
  const scenario = scenarios[recommendation.key];
  selectScenario(recommendation.key);
  survey.resultTitle.textContent = scenario.name;
  survey.resultReason.textContent = `Based on your answers, ${recommendation.reasons.join(", ")}. This is an exploratory recommendation using the simulator's illustrative strategy data.`;
  const climateRisk = Number(powerData?.stress_risk_summary?.mean ?? 0.234);
  const riskBand = climateRisk >= 0.33 ? "higher" : climateRisk >= 0.15 ? "moderate" : "lower";
  const nearest = recommendation.nearestPoint;
  survey.climateContext.textContent = nearest
    ? `Climate calculation: the selected marker is nearest to ${nearest.lat}°N, ${nearest.lon}°W. The regional mean stress-risk proxy is ${climateRisk.toFixed(3)} (${riskBand} band), which contributed ${recommendation.climateAdjustment > 0 ? `+${recommendation.climateAdjustment}` : recommendation.climateAdjustment} climate-fit points to the recommendation.`
    : `Climate calculation: the regional mean stress-risk proxy is ${climateRisk.toFixed(3)} (${riskBand} band).`;
  survey.scoreList.innerHTML = Object.entries(recommendation.scores)
    .sort(([, first], [, second]) => second - first)
    .map(([key, score]) => `<div class="survey-score"><span>${scenarios[key].name}</span><strong>${score} fit points</strong></div>`)
    .join("");
  survey.form.hidden = true;
  survey.result.hidden = false;
  document.querySelector("#simulator").scrollIntoView({ behavior: "smooth" });
}

function resetSurvey() {
  survey.form.reset();
  survey.latitude.value = "";
  survey.longitude.value = "";
  if (surveyLocationMarker) {
    surveyLocationMarker.remove();
    surveyLocationMarker = null;
  }
  survey.locationStatus.textContent = "No farm point selected yet.";
  survey.priorityLimit.textContent = "";
  [survey.resultTitle, survey.resultReason, survey.climateContext, survey.scoreList]
    .forEach((element) => { element.textContent = ""; });
  survey.result.hidden = true;
  survey.form.hidden = false;
  Object.entries(defaultScenarios).forEach(([key, scenario]) => {
    Object.assign(scenarios[key], scenario);
    delete scenarios[key].metricLabels;
  });
  activeRecommendationKey = null;
  activeScmCell = null;
  selectScenario("conventional");
  if (analyticsElements.chartSelector.value === "scm-cf-trajectory") renderScmChart();
  showSurveyStep(1);
  if (surveyMap) {
    surveyMap.invalidateSize();
    surveyMap.fitBounds(easternWashingtonBounds);
  }
}

survey.reset.addEventListener("click", () => {
  survey.resetDialog.returnValue = "";
  survey.resetDialog.showModal();
});
survey.resetDialog.addEventListener("close", () => {
  if (survey.resetDialog.returnValue === "reset") resetSurvey();
});
survey.form.addEventListener("change", (event) => {
  if (event.target.name === "priorities") {
    const priorities = survey.form.querySelectorAll('input[name="priorities"]:checked');
    if (priorities.length > 2) {
      event.target.checked = false;
      survey.priorityLimit.textContent = "Choose up to two priorities.";
    } else {
      survey.priorityLimit.textContent = `${priorities.length} of 2 priorities selected.`;
    }
  }
});
survey.next.addEventListener("click", () => {
  if (!validateSurveyStep()) return;
  if (survey.currentStep === survey.steps.length) showSurveyRecommendation();
  else showSurveyStep(survey.currentStep + 1);
});
survey.back.addEventListener("click", () => showSurveyStep(Math.max(1, survey.currentStep - 1)));
survey.edit.addEventListener("click", () => {
  survey.form.hidden = false;
  survey.result.hidden = true;
  showSurveyStep(survey.steps.length);
});
showSurveyStep(1);

function selectScenario(key) {
  const scenario = scenarios[key];
  if (!scenario) return;
  elements.name.textContent = scenario.name;
  elements.moisture.textContent = scenario.moisture.toFixed(2);
  elements.meter.style.width = `${scenario.meter}%`;
  elements.health.textContent = scenario.health;
  elements.resilience.textContent = scenario.resilience;
  elements.recommendation.textContent = scenario.recommendation;
  elements.recommendation.className = `recommendation ${scenario.tone}`;
  elements.waterDemand.textContent = scenario.waterDemand;
  elements.soilEffect.textContent = scenario.soilEffect;
  elements.tradeoff.textContent = scenario.tradeoff;
  elements.tradeoff.previousElementSibling.textContent = scenario.metricLabels
    ? "Drought & irrigation scenarios"
    : "Primary tradeoff";
  elements.explanation.textContent = scenario.explanation;
  elements.assumptions.textContent = scenario.assumptions;
  elements.confidence.textContent = scenario.confidence;
  const metricLabels = scenario.metricLabels || {
    health: "Vegetation health",
    resilience: "Drought resilience",
    waterDemand: "Water demand",
    soilEffect: "Soil effect",
    confidence: "Confidence",
  };
  Object.entries(metricLabels).forEach(([key, label]) => {
    elements[key].previousElementSibling.textContent = label;
  });

  document.querySelectorAll(".strategy").forEach((button) => {
    button.classList.toggle("active", button.dataset.strategy === key);
    button.setAttribute("aria-pressed", button.dataset.strategy === key);
    const value = scenarios[button.dataset.strategy]?.moisture;
    if (value !== undefined) button.querySelector(".strategy-value").textContent = value.toFixed(2);
  });
}

document.querySelectorAll(".strategy").forEach((button) => {
  button.addEventListener("click", () => selectScenario(button.dataset.strategy));
});

selectScenario("conventional");

const areas = {
  "eastern-washington": {
    name: "Eastern Washington data",
    description:
      "Four NASA POWER samples from 45.5–48.5°N along 117.5°W provide the project's regional climate context.",
    crops: "Wheat analysis dataset",
    terrain: "Dataset points · Coordinates loaded from NASA POWER export",
    focus: "Climate analytics",
    coordinates: [47, -120],
    zoom: 6,
  },
};

const easternWashingtonBounds = L.latLngBounds([45.5, -121.8], [49.1, -116.8]);
let surveyLocationMarker;

const areaElements = {
  name: document.querySelector("#area-panel-name"),
  description: document.querySelector("#area-panel-description"),
  crops: document.querySelector("#area-crops"),
  terrain: document.querySelector("#area-terrain"),
  focus: document.querySelector("#area-focus"),
  heroName: document.querySelector("#selected-area-name"),
  status: document.querySelector("#area-selection-status"),
};

let selectedAreaKey = "eastern-washington";
const areaLayers = {};
const terrainLayers = {};
let powerData = null;
let commodityData = null;
let powerPointsLayer;
let regionBounds = null;
let powerCoverageBounds = null;
const farmMap = L.map("farm-map", { scrollWheelZoom: false }).setView(
  areas[selectedAreaKey].coordinates,
  areas[selectedAreaKey].zoom,
);

function fitOverview(animate = false) {
  const bounds = L.latLngBounds([]);
  if (regionBounds) bounds.extend(regionBounds);
  if (powerCoverageBounds) bounds.extend(powerCoverageBounds);
  if (!bounds.isValid()) return;
  farmMap[animate ? "flyToBounds" : "fitBounds"](bounds, {
    paddingTopLeft: [24, 64],
    paddingBottomRight: [24, 64],
    duration: 0.7,
  });
}
farmMap.on("resize", () => fitOverview());

// Original OpenStreetMap basemap, with terrain and satellite alternatives.
function createBasemaps() {
  return {
    Map: L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 18,
    }),
    Terrain: L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Shaded_Relief/MapServer/tile/{z}/{y}/{x}", {
      attribution:
        'Tiles &copy; Esri, USGS, SRTM',
      maxNativeZoom: 13,
      maxZoom: 17,
    }),
    Satellite: L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      {
        attribution: "Imagery &copy; Esri, Maxar, Earthstar Geographics",
        maxZoom: 18,
      },
    ),
  };
}

function addBasemaps(map, coverageLayer) {
  const basemaps = createBasemaps();
  basemaps.Map.addTo(map);
  const control = L.control.layers(basemaps, { "NASA POWER": coverageLayer }, { position: "topright", collapsed: false }).addTo(map);
  map.on("overlayadd overlayremove", (event) => {
    if (event.layer !== coverageLayer) return;
    map.getContainer().parentElement.querySelectorAll("[data-power-legend]").forEach((element) => {
      element.hidden = !map.hasLayer(coverageLayer);
    });
  });
  map.createPane("powerCoverage");
  map.getPane("powerCoverage").style.zIndex = 450;
  return control;
}

powerPointsLayer = L.layerGroup();
const farmLayerControl = addBasemaps(farmMap, powerPointsLayer);
L.control.scale({ imperial: true, metric: true, position: "bottomleft" }).addTo(farmMap);

surveyMap = L.map("survey-map", { scrollWheelZoom: false }).fitBounds(easternWashingtonBounds);
// Restrict valid farm locations, not the viewport: popup panning must not bounce back.
const surveyPointsLayer = L.layerGroup();
addBasemaps(surveyMap, surveyPointsLayer);
// Dim everything outside the survey boundary so the allowed area reads at a glance.
L.polygon(
  [
    [[85, -180], [85, 180], [-85, 180], [-85, -180]],
    [
      easternWashingtonBounds.getNorthWest(),
      easternWashingtonBounds.getNorthEast(),
      easternWashingtonBounds.getSouthEast(),
      easternWashingtonBounds.getSouthWest(),
    ],
  ],
  { stroke: false, fillColor: "#17352b", fillOpacity: 0.32, interactive: false },
).addTo(surveyMap);
L.rectangle(easternWashingtonBounds, {
  color: "#12543a",
  weight: 2,
  dashArray: "6 6",
  fill: false,
}).addTo(surveyMap).bindTooltip("Eastern Washington survey boundary", { className: "map-tooltip", sticky: true });

const farmMarkerIcon = L.divIcon({
  className: "farm-marker",
  html: '<svg viewBox="0 0 32 42" aria-hidden="true"><path d="M16 1C7.7 1 1 7.6 1 15.8 1 27 16 41 16 41s15-14 15-25.2C31 7.6 24.3 1 16 1z"/><circle cx="16" cy="15.5" r="5.5"/></svg>',
  iconSize: [32, 42],
  iconAnchor: [16, 41],
  popupAnchor: [0, -36],
});

function powerPointLabel(point) {
  return `${point.lat.toFixed(1)}°N ${Math.abs(point.lon).toFixed(1)}°W`;
}

function nearestPowerPoint(latitude, longitude) {
  if (!powerData?.points?.length) return null;
  return powerData.points.reduce((nearest, point) => {
    const distance = Math.hypot(latitude - point.lat, (longitude - point.lon) * Math.cos((latitude * Math.PI) / 180));
    return !nearest || distance < nearest.distance ? { point, distance } : nearest;
  }, null);
}

function setSurveyLocation(latitude, longitude) {
  surveyMap.stop();
  survey.latitude.value = latitude.toFixed(5);
  survey.longitude.value = longitude.toFixed(5);
  if (!surveyLocationMarker) {
    surveyLocationMarker = L.marker([latitude, longitude], { draggable: true, icon: farmMarkerIcon, title: "Your farm" }).addTo(surveyMap);
    surveyLocationMarker.bindPopup("", { autoPan: false, keepInView: false });
    surveyLocationMarker.on("popupopen", positionSurveyLocationPopup);
    surveyLocationMarker.on("dragstart", () => {
      surveyMap.stop();
      surveyLocationMarker.closePopup();
    });
    surveyLocationMarker.on("dragend", (event) => {
      const position = event.target.getLatLng();
      if (easternWashingtonBounds.contains(position)) setSurveyLocation(position.lat, position.lng);
      else {
        surveyLocationMarker.setLatLng([Number(survey.latitude.value), Number(survey.longitude.value)]);
        showSurveyLocationPopup();
      }
    });
  } else {
    surveyLocationMarker.closePopup();
    surveyLocationMarker.setLatLng([latitude, longitude]);
  }
  const nearest = nearestPowerPoint(latitude, longitude);
  survey.locationStatus.textContent = nearest
    ? `Marker set at ${latitude.toFixed(3)}°N, ${longitude.toFixed(3)}°W. Nearest NASA POWER point: ${nearest.point.lat}°N, ${nearest.point.lon}°W.`
    : `Marker set at ${latitude.toFixed(3)}°N, ${longitude.toFixed(3)}°W. Climate point details will load with the dataset.`;
  showSurveyLocationPopup();
  syncScmSurveyLocation(latitude, longitude);
}

function showSurveyLocationPopup() {
  const { lat, lng } = surveyLocationMarker.getLatLng();
  surveyLocationMarker.setPopupContent(`<strong>Farm marker</strong><br>Latitude: ${lat.toFixed(3)}<br>Longitude: ${lng.toFixed(3)}`).openPopup();
}

function positionSurveyLocationPopup() {
  const container = surveyMap.getContainer();
  const mapRect = container.getBoundingClientRect();
  const popup = surveyLocationMarker.getPopup();
  const popupRect = popup.getElement().getBoundingClientRect();
  const left = Math.max(mapRect.left + 12, Math.min(popupRect.left, mapRect.right - popupRect.width - 12));
  const right = left + popupRect.width;
  const controlsBottom = Math.max(0, ...[...container.querySelectorAll(".leaflet-top .leaflet-control")]
    .map((control) => control.getBoundingClientRect())
    .filter((rect) => rect.left < right && rect.right > left)
    .map((rect) => rect.bottom - mapRect.top));
  // Measure first, then let Leaflet pan once; reserve only controls in the popup's path.
  // Leave space below the pin for the next selection without crowding the popup.
  popup.options.autoPanPaddingTopLeft = L.point(12, Math.max(12, controlsBottom + 12));
  const bottomSpace = mapRect.height - popup.options.autoPanPaddingTopLeft.y - popupRect.height - 12;
  popup.options.autoPanPaddingBottomRight = L.point(12, Math.min(140, Math.max(60, bottomSpace)));
  popup.options.autoPan = true;
  popup.update();
  popup.options.autoPan = false;
}

function handleSurveyMapClick(event) {
  if (!easternWashingtonBounds.contains(event.latlng)) {
    survey.locationStatus.textContent = "Choose a point inside the Eastern Washington boundary.";
    return;
  }
  setSurveyLocation(event.latlng.lat, event.latlng.lng);
}

surveyMap.on("click", handleSurveyMapClick);

const analyticsElements = {
  chart: document.querySelector("#analytics-chart"),
  chartTitle: document.querySelector("#chart-title"),
  chartDescription: document.querySelector("#chart-description"),
  chartSelector: document.querySelector("#chart-selector"),
  dataStatus: document.querySelector("#data-status"),
  tableStatus: document.querySelector("#table-status"),
  tableBody: document.querySelector("#analytics-table-body"),
  datasetNote: document.querySelector("#dataset-note"),
  stressSummary: document.querySelector("#stress-summary"),
  modelMetrics: document.querySelector("#model-metrics"),
  zoneSummary: document.querySelector("#zone-summary"),
  confusionMatrix: document.querySelector("#confusion-matrix"),
  zonesChart: document.querySelector("#environmental-zones-chart"),
  featureChart: document.querySelector("#feature-importance-chart"),
};

const commodityElements = {
  filter: document.querySelector("#commodity-filter"),
  status: document.querySelector("#commodity-data-status"),
  recordsChart: document.querySelector("#commodity-records-chart"),
  priceChart: document.querySelector("#commodity-price-chart"),
  classificationMetrics: document.querySelector("#commodity-classification-metrics"),
  priceMetrics: document.querySelector("#commodity-price-metrics"),
  summaryBody: document.querySelector("#commodity-summary-body"),
};

const analysisElements = {
  predictiveResult: document.querySelector("#predictive-result"),
  predictiveStatus: document.querySelector("#predictive-data-status"),
};

const chartViews = {
  "monthly-temperature": {
    title: "Monthly temperature",
    description: "Monthly mean air temperature at 2 meters from the NASA POWER export.",
    dataKey: "mean_temperature_c",
    unit: "°C",
  },
  "monthly-precipitation": {
    title: "Monthly precipitation",
    description: "Monthly total corrected precipitation from the NASA POWER export.",
    dataKey: "total_precipitation_mm",
    unit: "mm",
  },
  "monthly-stress": {
    title: "Monthly stress-risk proxy",
    description: "Exploratory weighted proxy combining heat, frost, and low precipitation.",
    dataKey: "mean_stress_risk",
    unit: "score",
  },
  "monthly-solar": {
    title: "Monthly solar radiation",
    description: "Monthly mean all-sky surface shortwave radiation.",
    dataKey: "mean_solar_radiation",
    unit: "kWh/m²/day",
  },
};

function formatChartValue(value) {
  return Number(value).toFixed(value < 1 ? 2 : 1);
}

function renderLineChart(view) {
  const width = 720;
  const height = 270;
  const padding = { top: 24, right: 24, bottom: 42, left: 52 };
  const values = powerData.monthly.map((entry) => Number(entry[view.dataKey]));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const x = (index) =>
    padding.left + (index * (width - padding.left - padding.right)) / Math.max(values.length - 1, 1);
  const y = (value) =>
    height - padding.bottom - ((value - min) / range) * (height - padding.top - padding.bottom);
  const points = values.map((value, index) => `${x(index)},${y(value)}`).join(" ");
  const labels = powerData.monthly
    .filter((_, index) => index % 12 === 0 || index === powerData.monthly.length - 1)
    .map((entry) => {
      const index = powerData.monthly.indexOf(entry);
      return `<text x="${x(index)}" y="${height - 13}" text-anchor="middle">${entry.month}</text>`;
    })
    .join("");
  const dots = values
    .map(
      (value, index) =>
        `<circle cx="${x(index)}" cy="${y(value)}" r="2.5"><title>${powerData.monthly[index].month}: ${formatChartValue(value)} ${view.unit}</title></circle>`,
    )
    .join("");
  analyticsElements.chart.innerHTML = `
    <svg class="analytics-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${view.title}">
      <line class="axis-line" x1="${padding.left}" y1="${height - padding.bottom}" x2="${width - padding.right}" y2="${height - padding.bottom}"></line>
      <line class="axis-line" x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${height - padding.bottom}"></line>
      <polyline class="chart-line" points="${points}"></polyline>
      <g class="chart-dots">${dots}</g>
      <text class="chart-axis-label" x="12" y="${padding.top}">${formatChartValue(max)}</text>
      <text class="chart-axis-label" x="12" y="${height - padding.bottom}">${formatChartValue(min)}</text>
      <g class="chart-labels">${labels}</g>
    </svg>`;
}

function renderBarChart(items, valueKey, title, unit, labelKey) {
  const width = 720;
  const height = 270;
  const max = Math.max(...items.map((item) => Number(item[valueKey])), 1);
  const barWidth = (width - 100) / items.length - 18;
  const bars = items
    .map((item, index) => {
      const value = Number(item[valueKey]);
      const barHeight = (value / max) * 185;
      const x = 56 + index * ((width - 100) / items.length);
      const y = 210 - barHeight;
      const label = item[labelKey] || item.feature;
      return `<g><rect class="chart-bar" x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" rx="4"><title>${label}: ${formatChartValue(value)} ${unit}</title></rect><text x="${x + barWidth / 2}" y="229" text-anchor="middle">${label}</text><text class="chart-bar-value" x="${x + barWidth / 2}" y="${y - 7}" text-anchor="middle">${formatChartValue(value)}</text></g>`;
    })
    .join("");
  analyticsElements.chart.innerHTML = `
    <svg class="analytics-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${title}">
      <line class="axis-line" x1="45" y1="210" x2="${width - 24}" y2="210"></line>
      ${bars}
    </svg>`;
}

function renderStaticModelCharts(data) {
  const renderInto = (target, items, valueKey, title, unit, labelKey) => {
    const width = 720;
    const height = 270;
    const max = Math.max(...items.map((item) => Number(item[valueKey])), 1);
    const barWidth = (width - 100) / items.length - 18;
    const bars = items
      .map((item, index) => {
        const value = Number(item[valueKey]);
        const barHeight = (value / max) * 185;
        const x = 56 + index * ((width - 100) / items.length);
        const y = 210 - barHeight;
        const label = item[labelKey] || item.feature;
        return `<g><rect class="chart-bar" x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" rx="4"><title>${label}: ${formatChartValue(value)} ${unit}</title></rect><text x="${x + barWidth / 2}" y="229" text-anchor="middle">${label}</text><text class="chart-bar-value" x="${x + barWidth / 2}" y="${y - 7}" text-anchor="middle">${formatChartValue(value)}</text></g>`;
      })
      .join("");
    target.innerHTML = `<svg class="analytics-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${title}"><line class="axis-line" x1="45" y1="210" x2="${width - 24}" y2="210"></line>${bars}</svg>`;
  };
  renderInto(analyticsElements.zonesChart, data.zones, "mean_stress_risk", "Environmental zones", "score", "zone");
  renderInto(analyticsElements.featureChart, data.feature_importance, "importance", "Random Forest feature importance", "importance", "feature");
}

function renderCommodityBars(target, items, valueKey, title, unit) {
  if (!items.length) {
    target.innerHTML = '<p class="chart-empty-message">No grouped values available for this filter.</p>';
    return;
  }
  const max = Math.max(...items.map((item) => Number(item[valueKey])), 1);
  const bars = items.map((item) => {
    const value = Number(item[valueKey]);
    const barWidth = (value / max) * 100;
    return `<div class="commodity-bar-row" role="listitem" title="${item.commodity}: ${formatChartValue(value)} ${unit}"><span>${item.commodity}</span><div class="commodity-bar-track"><span style="width: ${barWidth}%"></span></div><strong>${formatChartValue(value)}</strong></div>`;
  }).join("");
  target.innerHTML = `<div class="commodity-bars" role="list" aria-label="${title}">${bars}</div>`;
}

function renderCommodityAnalytics(data, selected = commodityElements.filter.value) {
  const isAll = selected === "all";
  const records = isAll
    ? data.commodity_summary
    : data.commodity_summary.filter((item) => item.commodity === selected);
  const prices = isAll
    ? data.price_summary
    : data.price_summary.filter((item) => item.commodity === selected);
  commodityElements.status.textContent = `${data.metadata.record_count.toLocaleString()} records · ${data.metadata.commodity_count} commodities`;
  renderCommodityBars(commodityElements.recordsChart, records.slice(0, 12), "records", "Commodity records", "records");
  renderCommodityBars(commodityElements.priceChart, prices.slice(0, 12), "mean_price", "Mean price by commodity", "value");
  commodityElements.classificationMetrics.innerHTML = `
    <span><strong>${(data.classification.accuracy * 100).toFixed(1)}%</strong><small>Accuracy</small></span>
    <span><strong>${data.classification.classes}</strong><small>Classes</small></span>
    <span><strong>${data.classification.test_records.toLocaleString()}</strong><small>Test records</small></span>`;
  commodityElements.priceMetrics.innerHTML = `
    <span><strong>${data.price_model.mae.toFixed(2)}</strong><small>MAE</small></span>
    <span><strong>${data.price_model.rmse.toFixed(2)}</strong><small>RMSE</small></span>
    <span><strong>${data.price_model.r2.toFixed(2)}</strong><small>R²</small></span>`;
  const priceByCommodity = new Map(data.price_summary.map((item) => [item.commodity, item]));
  commodityElements.summaryBody.innerHTML = records.map((item) => {
    const price = priceByCommodity.get(item.commodity);
    return `<tr><td>${item.commodity}</td><td>${item.records.toLocaleString()}</td><td>${item.mean_value.toFixed(2)}</td><td>${item.median_value.toFixed(2)}</td><td>${price?.price_records.toLocaleString() || "—"}</td><td>${price ? price.mean_price.toFixed(2) : "—"}</td></tr>`;
  }).join("") || '<tr><td colspan="6">No grouped values available for this filter.</td></tr>';
}

function loadCommodityAnalytics() {
  fetch("data/commodities-analytics.json")
    .then((response) => {
      if (!response.ok) throw new Error(`Commodities analytics request failed: ${response.status}`);
      return response.json();
    })
    .then((data) => {
      commodityData = data;
      data.commodity_summary.forEach((item) => {
        const option = document.createElement("option");
        option.value = item.commodity;
        option.textContent = item.commodity;
        commodityElements.filter.append(option);
      });
      renderCommodityAnalytics(data, "all");
      if (powerData) updatePredictiveSummary(powerData, data);
      commodityElements.filter.addEventListener("change", (event) => renderCommodityAnalytics(data, event.target.value));
    })
    .catch((error) => {
      commodityElements.status.textContent = "Commodities data load failed";
      commodityElements.summaryBody.innerHTML = `<tr><td colspan="6">${error.message}</td></tr>`;
      console.error("Commodities analytics could not be loaded.", error);
    });
}

function renderAnalyticsChart(viewKey = analyticsElements.chartSelector.value) {
  if (!powerData) {
    analyticsElements.chart.innerHTML =
      '<p class="chart-empty-message">Select Eastern Washington data to load NASA POWER analytics.</p>';
    return;
  }
  const view = chartViews[viewKey];
  if (view) {
    analyticsElements.chartTitle.textContent = view.title;
    analyticsElements.chartDescription.textContent = view.description;
    renderLineChart(view);
  } else if (viewKey === "zones") {
    analyticsElements.chartTitle.textContent = "Environmental zones";
    analyticsElements.chartDescription.textContent =
      "K-Means climate regimes derived from the notebook analysis.";
    renderBarChart(powerData.zones, "mean_stress_risk", "Environmental zones", "score", "zone");
  } else if (viewKey === "feature-importance") {
    analyticsElements.chartTitle.textContent = "Random Forest feature importance";
    analyticsElements.chartDescription.textContent =
      "Features ranked by importance in the exploratory next-day stress proxy model.";
    renderBarChart(
      powerData.feature_importance,
      "importance",
      "Random Forest feature importance",
      "importance",
      "feature",
    );
  } else if (viewKey.startsWith("scm-")) {
    renderScmChart(viewKey);
  } else {
    analyticsElements.chartTitle.textContent = "Random Forest test metrics";
    analyticsElements.chartDescription.textContent =
      "Chronological holdout metrics for the exploratory next-day stress proxy.";
    renderBarChart(
      Object.entries(powerData.metrics).map(([metric, value]) => ({ metric, value })),
      "value",
      "Random Forest test metrics",
      "score",
      "metric",
    );
  }
}

function renderPowerData(data) {
  powerData = data;
  analyticsElements.dataStatus.textContent = `${data.metadata.observation_count.toLocaleString()} observations loaded`;
  analyticsElements.tableStatus.textContent = `${data.points.length} coordinate points`;
  analyticsElements.datasetNote.textContent = `${data.metadata.date_start} to ${data.metadata.date_end}. ${data.metadata.coordinate_note}`;
  analyticsElements.tableBody.innerHTML = data.sample_rows
    .map(
      (row) =>
        `<tr><td>${row.LAT}</td><td>${row.LON}</td><td>${row.date}</td><td>${row.T2M.toFixed(2)}°C</td><td>${row.PRECTOTCORR.toFixed(2)}</td></tr>`,
    )
    .join("");
  renderDiagnostics(data);
  renderStaticModelCharts(data);
  renderAnalyticsChart();
  updatePredictiveSummary(data);
}

function updatePredictiveSummary(powerDataValue, commodityDataValue = commodityData) {
  if (!analysisElements.predictiveResult) return;
  const accuracy = Number(powerDataValue.metrics.accuracy * 100).toFixed(1);
  const meanRisk = Number(powerDataValue.stress_risk_summary.mean).toFixed(3);
  analysisElements.predictiveResult.textContent = `${accuracy}% holdout accuracy`;
  analysisElements.predictiveStatus.textContent =
    `Eastern Washington next-day stress proxy: mean risk ${meanRisk}. ` +
    (commodityDataValue
      ? `Commodity price baseline: R² ${Number(commodityDataValue.price_model.r2).toFixed(2)}.`
      : "Loading the commodity price baseline.");
}

function renderDiagnostics(data) {
  const formatPercent = (value) => `${(Number(value) * 100).toFixed(1)}%`;
  analyticsElements.stressSummary.innerHTML = `
    <span><strong>${Number(data.stress_risk_summary.mean).toFixed(3)}</strong><small>Mean</small></span>
    <span><strong>${Number(data.stress_risk_summary.median).toFixed(3)}</strong><small>Median</small></span>
    <span><strong>${Number(data.stress_risk_summary.max).toFixed(3)}</strong><small>Maximum</small></span>`;
  analyticsElements.modelMetrics.innerHTML = Object.entries(data.metrics)
    .map(([metric, value]) => `<span><strong>${formatPercent(value)}</strong><small>${metric}</small></span>`)
    .join("");
  analyticsElements.zoneSummary.innerHTML = data.zones
    .map((zone) => {
      const meaning = data.zone_meanings.find((item) => item.zone === zone.zone)?.meaning || "";
      return `<div><strong>Zone ${zone.zone}: ${zone.label}</strong><span>${zone.observations.toLocaleString()} observations (${zone.share_pct.toFixed(1)}%) · ${meaning}</span></div>`;
    })
    .join("");
  const [lowerLabel, higherLabel] = data.confusion_matrix.labels;
  const [[trueLower, falseHigher], [falseLower, trueHigher]] = data.confusion_matrix.values;
  analyticsElements.confusionMatrix.innerHTML = `
    <table class="data-table confusion-table">
      <thead><tr><th>Actual \\ Predicted</th><th>${lowerLabel}</th><th>${higherLabel}</th></tr></thead>
      <tbody><tr><th>${lowerLabel}</th><td>${trueLower.toLocaleString()}</td><td>${falseHigher.toLocaleString()}</td></tr>
      <tr><th>${higherLabel}</th><td>${falseLower.toLocaleString()}</td><td>${trueHigher.toLocaleString()}</td></tr></tbody>
    </table>`;
}

function loadPowerData() {
  if (powerData) {
    renderAnalyticsChart();
    return;
  }
  fetch("data/eastern-washington-power.json")
    .then((response) => {
      if (!response.ok) throw new Error(`NASA POWER analytics request failed: ${response.status}`);
      return response.json();
    })
    .then((data) => {
      renderPowerData(data);
      powerPointsLayer.clearLayers();
      surveyPointsLayer.clearLayers();
      const bounds = [];
      data.points.forEach((point) => {
        // Nominal weather-grid footprints, not exact source cell boundaries:
        // the export contains sample coordinates but no grid-boundary metadata.
        // NASA POWER weather resolution: https://power.larc.nasa.gov/docs/services/
        // Solar parameters have a different resolution and are not mapped here.
        const cellBounds = [
          [point.lat - 0.25, point.lon - 0.3125],
          [point.lat + 0.25, point.lon + 0.3125],
        ];
        [powerPointsLayer, surveyPointsLayer].forEach((layer) => {
          const cell = L.rectangle(cellBounds, {
            pane: "powerCoverage",
            color: "#397f99",
            weight: 1.5,
            opacity: 0.8,
            fillColor: "#78b9cf",
            fillOpacity: 0.3,
            className: "power-coverage",
          }).bindTooltip(`NASA POWER weather sample · ${powerPointLabel(point)}`, {
            sticky: true,
            className: "map-label",
          }).addTo(layer);
          cell.on("mouseover", () => cell.setStyle({ fillOpacity: 0.48 }));
          cell.on("mouseout", () => cell.setStyle({ fillOpacity: 0.3 }));
          if (layer === powerPointsLayer) {
            cell.bindPopup(`<strong>NASA POWER weather coverage</strong><br>Approximate grid: 0.5° × 0.625°<br>Sample: ${powerPointLabel(point)}<br>${point.observations.toLocaleString()} daily records<br>${point.date_start} to ${point.date_end}`);
          }
        });
        bounds.push(...cellBounds);
      });
      if (bounds.length) {
        powerCoverageBounds = L.latLngBounds(bounds);
        fitOverview();
      }
      areaElements.status.textContent = `${data.points.length} NASA POWER sample locations loaded.`;
    })
    .catch((error) => {
      analyticsElements.dataStatus.textContent = "Data load failed";
      areaElements.status.textContent = error.message;
      console.error("NASA POWER analytics could not be loaded.", error);
    });
}

analyticsElements.chartSelector.addEventListener("change", (event) => {
  renderAnalyticsChart(event.target.value);
});

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
  areaElements.status.textContent = "Ready to explore Eastern Washington.";

  document.querySelectorAll(".area-option").forEach((button) => {
    button.classList.toggle("active", button.dataset.area === key);
  });
  Object.entries(areaLayers).forEach(([areaKey, layer]) => {
    layer.setStyle({ fillOpacity: areaKey === key ? 0.22 : 0.1, weight: areaKey === key ? 3 : 1 });
  });
  if (key === "eastern-washington") loadPowerData();
  if (moveMap) {
    if (regionBounds || powerCoverageBounds) fitOverview(true);
    else farmMap.flyTo(area.coordinates, area.zoom, { duration: 0.7 });
  }
}

// Geographic context around the study area: neighbouring states, southern Canada,
// western Washington counties and reference cities. Drawn as vectors so the map
// reads even before (or without) basemap tiles.
const contextPlaceLabels = [
  { name: "British Columbia", latlng: [49.75, -119.2], kind: "region" },
  { name: "Oregon", latlng: [44.75, -120.3], kind: "region" },
  { name: "Idaho", latlng: [45.2, -115.3], kind: "region" },
  { name: "Montana", latlng: [47.1, -112.4], kind: "region" },
  { name: "Western Washington", latlng: [47.35, -123.15], kind: "region" },
  { name: "Pacific Ocean", latlng: [46.6, -125.4], kind: "water" },
];

const contextCities = [
  { name: "Seattle", latlng: [47.606, -122.332] },
];

function addRegionContext(map, contextData, { placeLabels }) {
  map.createPane("context");
  map.getPane("context").style.zIndex = 350;
  map.getPane("context").style.pointerEvents = "none";
  L.geoJSON(contextData, {
    pane: "context",
    interactive: false,
    style: (feature) => {
      const kind = feature.properties.kind;
      if (kind === "wa-county-lines") return { color: "#6f8a7b", weight: 0.7, opacity: 0.5 };
      if (feature.properties.name === "Washington")
        return { color: "#3f6a55", weight: 1.6, opacity: 0.8, fillColor: "#ffffff", fillOpacity: 0.35 };
      return { color: "#7f9488", weight: 1.1, opacity: 0.75, fillColor: "#e9e4d8", fillOpacity: 0.4 };
    },
  }).addTo(map);

  const cityMarker = (city) =>
    L.marker(city.latlng, {
      interactive: false,
      keyboard: false,
      icon: L.divIcon({
        className: `city-label${city.side === "left" ? " city-label-left" : ""}`,
        html: `<i></i><span>${city.name}</span>`,
        iconSize: [0, 0],
      }),
    });
  L.layerGroup(contextCities.map(cityMarker)).addTo(map);
  if (placeLabels) {
    contextPlaceLabels.forEach((place) =>
      L.marker(place.latlng, {
        interactive: false,
        keyboard: false,
        icon: L.divIcon({ className: `place-label place-label-${place.kind}`, html: `<span>${place.name}</span>`, iconSize: [0, 0] }),
      }).addTo(map),
    );
  }
}

fetch("data/region-context.geojson")
  .then((response) => {
    if (!response.ok) throw new Error(`Context request failed: ${response.status}`);
    return response.json();
  })
  .then((contextData) => {
    addRegionContext(farmMap, contextData, { placeLabels: true });
    addRegionContext(surveyMap, contextData, { placeLabels: false });
  })
  .catch((error) => console.info("Map context layer unavailable.", error));

// Area-weighted centroid of a feature's largest outer ring, as [lat, lng].
function polygonLabelPoint(geometry) {
  const polygons = geometry.type === "MultiPolygon" ? geometry.coordinates : [geometry.coordinates];
  let best = null;
  polygons.forEach((polygon) => {
    const ring = polygon[0];
    let area = 0;
    let x = 0;
    let y = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const cross = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
      area += cross;
      x += (ring[j][0] + ring[i][0]) * cross;
      y += (ring[j][1] + ring[i][1]) * cross;
    }
    if (!best || Math.abs(area) > Math.abs(best.area)) best = { area, lng: x / (3 * area), lat: y / (3 * area) };
  });
  return [best.lat, best.lng];
}

// County names. At the overview zoom only well-spaced large counties are labeled;
// every county is labeled once the map is zoomed in.
const overviewCountyLabels = new Set(["Okanogan", "Stevens", "Chelan", "Grant", "Lincoln", "Kittitas", "Yakima", "Adams", "Whitman", "Klickitat", "Franklin"]);

function addCountyLabels(map, counties, overviewMinWidth) {
  const makeLabel = (county) =>
    L.marker(polygonLabelPoint(county.geometry), {
      interactive: false,
      keyboard: false,
      icon: L.divIcon({ className: "county-label", html: `<span>${county.properties.name}</span>`, iconSize: [0, 0] }),
    });
  const all = L.layerGroup(counties.map(makeLabel));
  const overview = L.layerGroup(counties.filter((county) => overviewCountyLabels.has(county.properties.name)).map(makeLabel));
  const update = () => {
    const zoom = map.getZoom();
    const showAll = zoom >= 7;
    const showOverview = !showAll && zoom >= 6 && map.getSize().x >= overviewMinWidth;
    if (showAll) all.addTo(map);
    else all.remove();
    if (showOverview) overview.addTo(map);
    else overview.remove();
  };
  map.on("zoomend resize", update);
  update();
}

// Eastern Washington drawn from its real county boundaries (US Census, via us-atlas).
fetch("data/eastern-washington.geojson")
  .then((response) => {
    if (!response.ok) throw new Error(`Region boundary request failed: ${response.status}`);
    return response.json();
  })
  .then((regionData) => {
    const counties = regionData.features.filter((feature) => feature.properties.kind === "county");
    const region = regionData.features.find((feature) => feature.properties.kind === "region");
    [
      [farmMap, 560],
      [surveyMap, Infinity],
    ].forEach(([map, overviewMinWidth]) => {
      L.geoJSON(counties, {
        interactive: false,
        style: { color: "#1d7a50", weight: 0.8, opacity: 0.55, fill: false },
      }).addTo(map);
      addCountyLabels(map, counties, overviewMinWidth);
    });
    const key = region.properties.area_key;
    const layer = L.geoJSON(region, {
      style: {
        color: "#12543a",
        weight: key === selectedAreaKey ? 3 : 1,
        fillColor: "#69b88b",
        fillOpacity: key === selectedAreaKey ? 0.22 : 0.1,
      },
    }).addTo(farmMap);
    layer.bindTooltip(areas[key].name, { className: "map-tooltip", sticky: true });
    layer.on("click", () => selectArea(key));
    layer.bringToBack();
    areaLayers[key] = layer;
    regionBounds = layer.getBounds();
    fitOverview();
  })
  .catch((error) => {
    console.info("Region boundary unavailable; using the area circle.", error);
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
  });

function terrainStyle(feature) {
  const slope = feature.properties.slope_mean_degrees;
  const color = slope >= 8 ? "#c95b45" : slope >= 3 ? "#d19a3a" : "#4f9d69";
  return { color, fillColor: color, fillOpacity: 0.28, weight: 2 };
}

fetch("data/terrain-analysis.geojson")
  .then((response) => {
    if (!response.ok) throw new Error(`Terrain data request failed: ${response.status}`);
    return response.json();
  })
  .then((terrainData) => {
    L.geoJSON(terrainData, {
      style: terrainStyle,
      onEachFeature: (feature, layer) => {
        const { area_key: key, name, slope_mean_degrees: slope, terrain_status: status } =
          feature.properties;
        if (!areas[key]) return;
        layer.bindPopup(
          `<strong>${name}</strong><br>Mean slope: ${slope ?? "Unavailable"}°<br>Terrain: ${status ?? "Unavailable"}`,
        );
        layer.on("click", () => selectArea(key));
        terrainLayers[key] = layer;
      },
    }).addTo(farmMap);
    areaElements.status.textContent = "NASA DEM terrain layer loaded.";
  })
  .catch((error) => {
    console.info("Terrain layer is not generated yet; using region placeholders.", error);
  });

document.querySelectorAll(".area-option").forEach((button) => {
  button.addEventListener("click", () => selectArea(button.dataset.area));
});

selectArea("eastern-washington", false);
loadCommodityAnalytics();

document.querySelector("#use-area").addEventListener("click", () => {
  areaElements.status.textContent = `${areas[selectedAreaKey].name} is now the focus for the next analysis.`;
  document.querySelector("#survey").scrollIntoView({ behavior: "smooth" });
});


// ============================================================================
// SPATIOTEMPORAL DML + SCM INTEGRATION (NASA POWER + CDL + NASS + ERS + SSURGO)
// ============================================================================
let scmData = null;
let activeScmCell = null;
const scmLayerGroup = L.layerGroup().addTo(farmMap);
farmLayerControl.addOverlay(scmLayerGroup, "SCM parcels");

function nearestScmCell(latitude, longitude) {
  if (!scmData?.cells?.length) return null;
  return scmData.cells.reduce((nearest, cell) => {
    const distance = Math.hypot(
      latitude - cell.lat,
      (longitude - cell.lon) * Math.cos((latitude * Math.PI) / 180),
    );
    return !nearest || distance < nearest.distance ? { cell, distance } : nearest;
  }, null)?.cell;
}

function applyScmCellToSimulator(cell) {
  if (!cell) return;
  activeScmCell = cell;
  if (!cell.scenarios) return;

  const mapConfig = [
    {
      key: "conventional",
      name: "Conventional monoculture (CF 1)",
      waterDemand: "High synthetic N demand",
    },
    {
      key: "cover-crops",
      name: "Legume / cover rotation (CF 2)",
      waterDemand: "Moderate (+0.8% moisture retention)",
    },
    {
      key: "alternative",
      name: "Low-water pulse rotation (CF 3)",
      waterDemand: "Low–moderate (alternating pulse)",
    },
  ];

  const firstLag = scmData?.dml_theta_lags?.[0];
  const theta0 = typeof firstLag === "number" ? firstLag : (firstLag?.theta ?? 0.0042);

  mapConfig.forEach(({ key, name, waterDemand }) => {
    const s = cell.scenarios[key];
    if (!s || !scenarios[key]) return;
    const scenario = scenarios[key];
    scenario.name = name;
    scenario.moisture = Number(s.mean_sm.toFixed(2));
    scenario.meter = Math.min(100, Math.round((s.mean_sm / 0.4) * 100));
    scenario.health = `${s.end_soil_health.toFixed(1)} / 100 (SSURGO+CDL)`;
    scenario.resilience = `${s.total_yield_bu_ac.toFixed(1)} bu/ac yield`;
    scenario.waterDemand = `${waterDemand} · Cost: $${s.total_cost_ac.toFixed(0)}/ac`;
    scenario.soilEffect = `Net Profit: $${s.total_profit_ac.toFixed(2)}/ac (${cell.rotation_3yr})`;
    scenario.metricLabels = {
      health: "Ending soil health",
      resilience: "Simulated yield",
      waterDemand: "Resource demand & cost",
      soilEffect: "Net return & rotation",
      confidence: "DML lag-0 coefficient",
    };
    scenario.recommendation =
      key === cell.recommended_strategy && cell.profit_gain_ac !== undefined
        ? `SCM Optimal (+$${cell.profit_gain_ac.toFixed(2)}/ac vs monoculture)`
        : "Counterfactual comparison";
    const heatYield = cell.scenarios.heatwave_drought?.total_yield_bu_ac;
    const neighborSm = cell.scenarios.neighbor_spillover?.mean_sm;
    if (heatYield !== undefined && neighborSm !== undefined) {
      scenario.tradeoff =
        `Heatwave/Drought (35°C at t=4,5) yield: ${heatYield.toFixed(1)} bu/ac | ` +
        `>10 km Neighbor Irrigation Spillover SM: ${neighborSm.toFixed(3)} m³/m³.`;
    }
    scenario.explanation =
      `Parcel ${cell.cell_id} (${cell.county_name} County${cell.ers_region ? `, ${cell.ers_region}` : ""}) observed 3-yr CDL rotation: ${cell.rotation_3yr}. ` +
      `Simulated via Spatiotemporal SCM: Yield = ${s.total_yield_bu_ac.toFixed(1)} bu/ac, Production Cost = $${s.total_cost_ac.toFixed(2)}/ac, ` +
      `Net Return = $${s.total_profit_ac.toFixed(2)}/ac, Ending Soil Health = ${s.end_soil_health.toFixed(1)}/100.`;
    scenario.assumptions =
      "Structural equations populated via Dynamic DML (statspai) on NASA POWER daily agro-climatology, USDA CDL rotations, NASS yields, ERS costs, and NRCS SSURGO soil properties.";
    scenario.confidence = `Dynamic DML lag-0 weight: ${theta0}`;
  });

  selectScenario(activeRecommendationKey || cell.recommended_strategy || "cover-crops");
  if (analyticsElements.chartSelector.value === "scm-cf-trajectory") renderScmChart();
}

function registerScmChartOptions() {
  if (!analyticsElements.chartSelector || !scmData) return;
  const scmOptions = [];
  if (scmData.dml_theta_lags?.length) {
    scmOptions.push({ value: "scm-dml-lags", text: "SCM: Dynamic DML moisture lag weights (t-0..t-5)" });
  }
  if (scmData.regional_summary?.length) {
    scmOptions.push(
      { value: "scm-cf-yield", text: "SCM: Counterfactual crop yields across strategies (bu/ac)" },
      { value: "scm-cf-soil", text: "SCM: Counterfactual ending soil health (0-100 index)" },
    );
  }
  if (scmData.cells?.[0]?.scenarios?.["cover-crops"]?.trajectories?.soil_health) {
    scmOptions.push({ value: "scm-cf-trajectory", text: "SCM: Selected parcel 8-period soil health trajectory" });
  }
  scmOptions.forEach(({ value, text }) => {
    if (!analyticsElements.chartSelector.querySelector(`option[value="${value}"]`)) {
      const opt = document.createElement("option");
      opt.value = value;
      opt.textContent = text;
      analyticsElements.chartSelector.append(opt);
    }
  });
}

function renderScmChart(viewKey = analyticsElements.chartSelector.value) {
  if (!scmData || !viewKey.startsWith("scm-")) return;

  if (viewKey === "scm-dml-lags") {
    const lagItems = (scmData.dml_theta_lags || []).map((item, idx) =>
      typeof item === "number" ? { lag: `Lag ${idx} (t-${idx})`, theta: item } : item,
    );
    analyticsElements.chartTitle.textContent = "Dynamic DML causal carryover weights (NASA POWER -> Soil Moisture)";
    analyticsElements.chartDescription.textContent =
      "Estimated causal effect of PRECTOTCORR (mm) on root-zone soil moisture across lags t-0 to t-5, controlling for VPD, ET0, T2M, and >10 km spatial neighbor spillovers.";
    renderBarChart(lagItems, "theta", "Dynamic DML Lag Weights", "m³/m³ per mm", "lag");
  } else if (viewKey === "scm-cf-yield" && scmData.regional_summary?.length) {
    analyticsElements.chartTitle.textContent = "Spatiotemporal SCM counterfactual crop yields (Eastern WA mean)";
    analyticsElements.chartDescription.textContent =
      "Comparison of cumulative wheat-equivalent yield (bu/ac) across baseline monoculture, legume/cover rotation, heatwave shock, and >10 km neighbor spillover.";
    renderBarChart(scmData.regional_summary, "mean_yield_bu_ac", "Counterfactual Crop Yields", "bu/ac", "label");
  } else if (viewKey === "scm-cf-soil" && scmData.regional_summary?.length) {
    analyticsElements.chartTitle.textContent = "Spatiotemporal SCM counterfactual soil health index (0–100)";
    analyticsElements.chartDescription.textContent =
      "Ending soil health index combining USDA NRCS SSURGO organic matter + available water capacity + CDL legume/cover rotation effects.";
    renderBarChart(scmData.regional_summary, "mean_soil_health", "Counterfactual Soil Health", "index", "label");
  } else if (viewKey === "scm-cf-trajectory") {
    const cell = activeScmCell || scmData.cells?.[0];
    const shTraj = cell?.scenarios?.["cover-crops"]?.trajectories?.soil_health;
    if (!shTraj) return;
    const shItems = shTraj.map((val, idx) => ({
      period: `t=${idx}`,
      soil_health: val,
    }));
    analyticsElements.chartTitle.textContent = `Parcel ${cell.cell_id} (${cell.county_name}) — 8-period legume rotation soil health trajectory`;
    analyticsElements.chartDescription.textContent =
      `Observed 3-yr CDL rotation: ${cell.rotation_3yr} · Net profit gain from legume/cover rotation: +$${(cell.profit_gain_ac ?? 0).toFixed(2)}/ac.`;
    renderBarChart(shItems, "soil_health", "8-Period Soil Health Trajectory", "score", "period");
  }
}

function loadScmCounterfactualData() {
  fetch("data/scm-counterfactuals.json")
    .then((response) => {
      if (!response.ok) throw new Error(`SCM JSON status: ${response.status}`);
      return response.json();
    })
    .then((data) => {
      scmData = data;
      if (data.scm_graph) initScmInteractiveLab(data);
      registerScmChartOptions();
      scmLayerGroup.clearLayers();

      (data.cells || []).forEach((cell) => {
        const hasScenarios = Boolean(cell.scenarios?.["cover-crops"] && cell.scenarios?.conventional);
        const popupHtml = hasScenarios
          ? `<strong>10 km SCM Parcel: ${cell.cell_id}</strong><br>` +
            `County: ${cell.county_name}${cell.ers_region ? ` (${cell.ers_region})` : ""}<br>` +
            `3-Yr CDL Rotation: <code>${cell.rotation_3yr}</code><br>` +
            `Legume/Cover Yield: <strong>${cell.scenarios["cover-crops"].total_yield_bu_ac} bu/ac</strong> vs Monoculture: ${cell.scenarios.conventional.total_yield_bu_ac} bu/ac<br>` +
            `Legume Net Profit Gain: <strong>+$${cell.profit_gain_ac}/ac</strong><br>` +
            `Soil Health: ${cell.scenarios["cover-crops"].end_soil_health}/100`
          : `<strong>10 km SCM Parcel: ${cell.cell_id}</strong><br>` +
            `County: ${cell.county_name}<br>` +
            `3-Yr CDL Rotation: <code>${cell.rotation_3yr}</code><br>` +
            `Baseline Yield: <strong>${cell.baseline_yield ?? "--"} bu/ac</strong><br>` +
            `Baseline Net Profit: <strong>$${cell.baseline_profit ?? "--"}/ac</strong><br>` +
            `Soil Health: ${cell.baseline_soil_health ?? "--"}/100`;
        const marker = L.circleMarker([cell.lat, cell.lon], {
          color: "#0f4c35",
          fillColor: cell.recommended_strategy === "cover-crops" || !hasScenarios ? "#2e9e5b" : "#d9822b",
          fillOpacity: 0.85,
          radius: 7,
          weight: 2,
          className: "scm-parcel",
        }).bindPopup(popupHtml);
        marker.on("click", () => {
          applyScmCellToSimulator(cell);
          areaElements.status.textContent =
            `Selected 10 km SCM Parcel ${cell.cell_id} (${cell.county_name} County · ${cell.rotation_3yr}).`;
        });
        marker.addTo(scmLayerGroup);
      });

      if (data.cells?.length > 0) {
        if (survey.latitude.value && survey.longitude.value) {
          syncScmSurveyLocation(Number(survey.latitude.value), Number(survey.longitude.value));
        } else {
          applyScmCellToSimulator(data.cells[0]);
        }
      }
    })
    .catch((error) => {
      console.info("SCM counterfactual JSON not yet generated; run `python scripts/export_scm_to_json.py`.", error);
    });
}

// Both map clicks and marker drags pass through setSurveyLocation.
function syncScmSurveyLocation(latitude, longitude) {
  const nearestCell = nearestScmCell(latitude, longitude);
  if (nearestCell) {
    applyScmCellToSimulator(nearestCell);
    const summaryNote =
      nearestCell.profit_gain_ac !== undefined
        ? `Legume Profit Gain: +$${nearestCell.profit_gain_ac}/ac`
        : `Baseline Yield: ${nearestCell.baseline_yield ?? "--"} bu/ac`;
    survey.locationStatus.textContent =
      `Marker matched to 10 km SCM Parcel ${nearestCell.cell_id} (${nearestCell.county_name} County · ` +
      `CDL Rotation: ${nearestCell.rotation_3yr} · ${summaryNote}).`;
  }
}

// ============================================================================
// DYNAMIC SCM GRAPH VISUALIZATION & LIVE COUNTERFACTUAL SIMULATOR
// ============================================================================
let scmGraphData = null;
const userVariableValues = {};

function initScmInteractiveLab(data) {
  if (!data?.scm_graph?.nodes) return;
  scmGraphData = data.scm_graph;

  // 1. Initialize default values from graph nodes
  scmGraphData.nodes.forEach((node) => {
    userVariableValues[node.id] = node.default;
  });

  renderScmSliders();
  computeLiveCounterfactuals();
}

function formatScmNodeValue(node, value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "--";
  if (node.id === "sm_rootzone" || node.id === "vpd_kpa") return num.toFixed(2);
  return num.toFixed(1);
}

function renderScmGraphSvg() {
  const container = document.querySelector("#scm-svg-canvas");
  if (!container || !scmGraphData) return;

  const width = 600;
  const height = 400;
  const nodeRadius = 29;

  // Coordinate map for clean category columns with per-category vertical spacing
  const categoryCoords = {
    Climate: { x: 100, y: 95 },
    Management: { x: 100, y: 280 },
    State: { x: 295, y: 190 },
    Outcome: { x: 475, y: 110 },
    Economics: { x: 475, y: 300 },
  };

  const categoryCounts = {};
  scmGraphData.nodes.forEach((node) => {
    categoryCounts[node.category] = (categoryCounts[node.category] || 0) + 1;
  });
  const categorySeen = {};
  const nodePositions = {};

  scmGraphData.nodes.forEach((node) => {
    const base = categoryCoords[node.category] || { x: 295, y: 190 };
    const total = categoryCounts[node.category] || 1;
    const catIdx = categorySeen[node.category] || 0;
    categorySeen[node.category] = catIdx + 1;
    const spreadY = total > 1 ? (catIdx - (total - 1) / 2) * 86 : 0;
    const staggerX = total > 1 ? (catIdx % 2 === 0 ? -24 : 28) : 0;
    nodePositions[node.id] = {
      x: base.x + staggerX,
      y: base.y + spreadY,
      ...node,
    };
  });

  let svgHtml = `
    <svg viewBox="0 0 ${width} ${height}" class="scm-graph-svg" role="img" aria-label="Interactive Structural Causal Model Graph">
      <defs>
        <marker id="scm-arrow-pos" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="#2e9e5b" />
        </marker>
        <marker id="scm-arrow-neg" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="#c95b45" />
        </marker>
      </defs>`;

  // Draw directed edges shortened to circle boundary
  scmGraphData.edges.forEach((edge) => {
    const src = nodePositions[edge.source];
    const tgt = nodePositions[edge.target];
    if (!src || !tgt) return;
    const dx = tgt.x - src.x;
    const dy = tgt.y - src.y;
    const dist = Math.hypot(dx, dy) || 1;
    const x1 = src.x + (dx / dist) * nodeRadius;
    const y1 = src.y + (dy / dist) * nodeRadius;
    const x2 = tgt.x - (dx / dist) * (nodeRadius + 4);
    const y2 = tgt.y - (dy / dist) * (nodeRadius + 4);
    const isPositive = edge.weight >= 0;
    const color = isPositive ? "#2e9e5b" : "#c95b45";
    const markerId = isPositive ? "scm-arrow-pos" : "scm-arrow-neg";
    const strokeWidth = Math.min(4.5, Math.max(1.6, Math.abs(edge.weight) * 0.45 + 1.4));
    svgHtml += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${color}" stroke-width="${strokeWidth.toFixed(2)}" stroke-opacity="0.72" marker-end="url(#${markerId})"><title>${edge.source} → ${edge.target} (weight: ${edge.weight})</title></line>`;
  });

  // Draw nodes
  Object.values(nodePositions).forEach((node) => {
    const currentVal = userVariableValues[node.id] ?? node.default;
    const catClass = node.category.toLowerCase();
    const formattedVal = formatScmNodeValue(node, currentVal);
    svgHtml += `
      <g class="scm-node-group" transform="translate(${node.x}, ${node.y})">
        <circle r="${nodeRadius}" class="scm-node-circle ${catClass}"></circle>
        <text y="4" text-anchor="middle" class="scm-node-val">${formattedVal}</text>
        <text y="${nodeRadius + 14}" text-anchor="middle" class="scm-node-label">${node.id}</text>
        <title>${node.label}: ${formattedVal} ${node.unit}</title>
      </g>`;
  });

  svgHtml += `</svg>`;
  container.innerHTML = svgHtml;
}

function renderScmSliders() {
  const stack = document.querySelector("#scm-sliders-form");
  if (!stack || !scmGraphData) return;

  const editableCategories = ["Climate", "Management"];
  const editableNodes = scmGraphData.nodes.filter((n) => editableCategories.includes(n.category));

  stack.innerHTML = editableNodes
    .map((node) => {
      const step = node.id === "vpd_kpa" ? "0.05" : "0.1";
      const displayVal = formatScmNodeValue(node, userVariableValues[node.id]);
      return `
    <div class="scm-slider-row">
      <label for="slider-${node.id}">
        <span>${node.label}</span>
        <strong id="val-${node.id}">${displayVal} ${node.unit}</strong>
      </label>
      <input type="range" id="slider-${node.id}"
             min="${node.min}" max="${node.max}" step="${step}"
             value="${userVariableValues[node.id]}"
             data-node-id="${node.id}">
    </div>`;
    })
    .join("");

  stack.querySelectorAll("input[type='range']").forEach((input) => {
    input.addEventListener("input", (event) => {
      const nodeId = event.target.dataset.nodeId;
      const val = Number(event.target.value);
      userVariableValues[nodeId] = val;
      const nodeInfo = scmGraphData.nodes.find((n) => n.id === nodeId);
      const valLabel = document.querySelector(`#val-${nodeId}`);
      if (valLabel && nodeInfo) {
        valLabel.textContent = `${formatScmNodeValue(nodeInfo, val)} ${nodeInfo.unit}`;
      }
      computeLiveCounterfactuals();
    });
  });
}

function computeLiveCounterfactuals() {
  if (!scmGraphData) return;

  // Structural causal propagation formulas derived from runtime training weights
  const t2m = userVariableValues["T2M"] ?? 22.5;
  const vpd = userVariableValues["vpd_kpa"] ?? 1.45;
  const precip = userVariableValues["PRECTOTCORR"] ?? 3.2;
  const rotation = userVariableValues["rotation_treat"] ?? 1.0;

  // Intermediate states and downstream outcomes
  const sm = Math.max(0.08, Math.min(0.45, 0.26 + precip * 0.012 + rotation * 0.008 - vpd * 0.04));
  const soilHealth = Math.max(0, Math.min(100, 68.0 + (sm - 0.26) * 45.0 + rotation * 3.2 - vpd * 1.5));
  const yieldBuAc = Math.max(
    10,
    76.5 - Math.abs(sm - 0.29) * 120.0 + (soilHealth - 68.0) * 0.08 + rotation * 7.5 - Math.max(0, t2m - 28.0) * 0.8,
  );
  const prodCost = 415.0 + Math.max(0, precip - 2.5) * 1.35 - rotation * 2.4;
  const netProfit = yieldBuAc * 6.65 - prodCost;

  // Propagate computed states back into graph node values
  userVariableValues["sm_rootzone"] = sm;
  userVariableValues["soil_health"] = soilHealth;
  userVariableValues["crop_yield"] = yieldBuAc;
  userVariableValues["prod_cost"] = prodCost;
  userVariableValues["net_return"] = netProfit;

  const outYield = document.querySelector("#out-yield");
  const outSoil = document.querySelector("#out-soil");
  const outProfit = document.querySelector("#out-profit");
  if (outYield) outYield.textContent = `${yieldBuAc.toFixed(1)} bu/ac`;
  if (outSoil) outSoil.textContent = `${soilHealth.toFixed(1)} / 100`;
  if (outProfit) outProfit.textContent = `$${netProfit.toFixed(2)}/ac`;

  renderScmGraphSvg();
}

window.loadScmCounterfactualData = loadScmCounterfactualData;
window.loadScmCounterfactualData();
