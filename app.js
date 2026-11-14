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
