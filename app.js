const scenarios = {
  conventional: {
    name: "Conventional rotation",
    moisture: 0.15,
    meter: 50,
    health: "At risk",
    resilience: "Low",
    recommendation: "Baseline",
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
    name: "Rotation + cover crops",
    moisture: 0.19,
    meter: 76,
    health: "Stable",
    resilience: "Higher",
    recommendation: "Best illustrative outcome",
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
    name: "Alternative cover crop mix",
    moisture: 0.18,
    meter: 68,
    health: "Stable",
    resilience: "Moderate",
    recommendation: "Promising alternative",
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
  priorityLimit: document.querySelector("#priority-limit"),
  currentStep: 1,
};

function checkedValues(name) {
  return [...survey.form.querySelectorAll(`input[name="${name}"]:checked`)].map((input) => input.value);
}

function readSurveyAnswers() {
  const formData = new FormData(survey.form);
  return {
    location: formData.get("location")?.trim() || "",
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
}

function validateSurveyStep() {
  const current = survey.steps[survey.currentStep - 1];
  const required = current.querySelector("[required]");
  if (required && !required.checkValidity()) {
    required.reportValidity();
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
  if (selectedAreaKey === "great-plains") {
    scores.alternative += 1;
    reasons.push("the Great Plains focus is water conservation");
  } else if (selectedAreaKey === "central-valley") {
    scores["cover-crops"] += 1;
    reasons.push("the Central Valley focus is water availability and soil protection");
  } else {
    scores.alternative += 1;
    reasons.push("the East Africa focus is rainfall resilience");
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
  return { key: ranked[0][0], scores, reasons };
}

function showSurveyRecommendation() {
  const answers = readSurveyAnswers();
  const recommendation = calculateRecommendation(answers);
  const scenario = scenarios[recommendation.key];
  selectScenario(recommendation.key);
  survey.resultTitle.textContent = scenario.name;
  survey.resultReason.textContent = `Based on your answers, ${recommendation.reasons.join(", ")}. This is an exploratory recommendation using the simulator's illustrative strategy data.`;
  survey.scoreList.innerHTML = Object.entries(recommendation.scores)
    .sort(([, first], [, second]) => second - first)
    .map(([key, score]) => `<div class="survey-score"><span>${scenarios[key].name}</span><strong>${score} fit points</strong></div>`)
    .join("");
  survey.form.hidden = true;
  survey.result.hidden = false;
  document.querySelector("#simulator").scrollIntoView({ behavior: "smooth" });
}

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
  elements.explanation.textContent = scenario.explanation;
  elements.assumptions.textContent = scenario.assumptions;
  elements.confidence.textContent = scenario.confidence;

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
const terrainLayers = {};
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

document.querySelector("#use-area").addEventListener("click", () => {
  areaElements.status.textContent = `${areas[selectedAreaKey].name} is now the focus for the next analysis.`;
  document.querySelector("#survey").scrollIntoView({ behavior: "smooth" });
});
