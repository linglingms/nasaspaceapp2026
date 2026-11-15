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
  "eastern-washington": {
    name: "Eastern Washington data",
    description:
      "NASA POWER sample data covering Eastern Washington from 45.5–48.5°N and 122.5–117.5°W.",
    crops: "Wheat analysis dataset",
    terrain: "Dataset points · Coordinates loaded from NASA POWER export",
    focus: "Climate analytics",
    coordinates: [47, -120],
    zoom: 6,
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
let powerData = null;
let powerPointsLayer;
const farmMap = L.map("farm-map", { scrollWheelZoom: false }).setView(
  areas[selectedAreaKey].coordinates,
  areas[selectedAreaKey].zoom,
);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  maxZoom: 18,
}).addTo(farmMap);

powerPointsLayer = L.layerGroup().addTo(farmMap);

const analyticsElements = {
  chart: document.querySelector("#analytics-chart"),
  chartTitle: document.querySelector("#chart-title"),
  chartDescription: document.querySelector("#chart-description"),
  chartSelector: document.querySelector("#chart-selector"),
  dataStatus: document.querySelector("#data-status"),
  tableStatus: document.querySelector("#table-status"),
  tableBody: document.querySelector("#analytics-table-body"),
  datasetNote: document.querySelector("#dataset-note"),
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
  renderAnalyticsChart();
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
      const bounds = [];
      data.points.forEach((point) => {
        const marker = L.circleMarker([point.lat, point.lon], {
          color: "#12543a",
          fillColor: "#f1b84b",
          fillOpacity: 0.9,
          radius: 8,
          weight: 2,
        }).bindPopup(
          `<strong>NASA POWER data point</strong><br>Latitude: ${point.lat}<br>Longitude: ${point.lon}<br>Observations: ${point.observations}<br>${point.date_start} to ${point.date_end}`,
        );
        marker.addTo(powerPointsLayer);
        bounds.push([point.lat, point.lon]);
      });
      if (bounds.length) farmMap.fitBounds(bounds, { padding: [35, 35] });
      areaElements.status.textContent = `NASA POWER loaded: ${data.points.length} LAT/LON points shown.`;
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
  areaElements.status.textContent = "Ready to explore this placeholder area.";

  document.querySelectorAll(".area-option").forEach((button) => {
    button.classList.toggle("active", button.dataset.area === key);
  });
  Object.entries(areaLayers).forEach(([areaKey, layer]) => {
    layer.setStyle({ fillOpacity: areaKey === key ? 0.3 : 0.12, weight: areaKey === key ? 3 : 1 });
  });
  powerPointsLayer.clearLayers();
  if (key === "eastern-washington") loadPowerData();
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
