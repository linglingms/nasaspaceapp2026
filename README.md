# TerraCycle AI

TerraCycle AI is a static NASA Space Apps prototype for exploring climate-aware
crop rotation decisions in Eastern Washington. It combines NASA POWER climate
observations, Washington commodities records, an interactive Leaflet map, a
survey-driven rotation simulator, exploratory statistical models, and clear
model limitations.

**Repository:** [github.com/linglingms/nasaspaceapp2026](https://github.com/linglingms/nasaspaceapp2026)

**Production app:** <https://nasaspaceapp2026causualfarm.vercel.app>

## What the app does

TerraCycle AI follows this workflow:

1. Watch the optional opening sequence from orbit to the Eastern Washington
   study area.
2. Select the Eastern Washington focus area and inspect NASA POWER observation
   points, climate coverage, counties, cities, and terrain context.
3. Review climate charts, environmental zones, stress-risk summaries, and
   Random Forest diagnostics.
4. Explore Washington commodity groups, price records, classification metrics,
   and price-prediction metrics.
5. Place and drag a farm marker inside the bounded Eastern Washington survey
   map.
6. Answer questions about crops, water, season, priorities, soil, acreage,
   budget, equipment, and markets.
7. Compare three rotation strategies using survey inputs, climate context, and
   the selected SCM parcel.

The application is decision-support research software, not automated farm advice.

## Demo experience and interface behavior

The app is designed as a guided research demo rather than a form-only dashboard:

- `assets/intro/intro.mp4` and `assets/intro/intro.webm` provide the opening
  orbit-to-region animation, with a skip/control path into the application.
- The focus-area map supports optional NASA POWER sample-point and coverage
  layers, county boundaries, nearby-state context, city labels, terrain
  context, and a detailed OpenStreetMap basemap.
- The survey map is separate from the focus map and keeps the selected farm
  marker in survey state.
- Survey questions remain on the current step until the user chooses the next
  question or submits the recommendation. A reset control confirms before
  clearing survey inputs and results.
- Strategy cards expose the recommendation, moisture estimate, fit score,
  confidence, tradeoffs, and explanation instead of presenting a single
  unexplained answer.

## Current geographic scope

The app intentionally contains one focus area: **Eastern Washington**. The top
focus-area map preserves the original selected-area behavior and displays NASA
POWER latitude/longitude points. The survey has a separate map with a bounded
Eastern Washington rectangle where users can place and drag a farm marker.

The survey marker:

- Stores latitude and longitude in the survey state.
- Rejects points outside the Eastern Washington boundary.
- Finds the nearest NASA POWER sample point.
- Uses the regional stress-risk proxy and selected location in the recommendation
  explanation.
- Accepts an address or county as optional text context; the marker is the
  coordinate used for climate matching.

The climate dataset currently contains 7,308 usable observations from 2020–2024
and four sample points at approximately 45.5–48.5°N and 117.5°W.

## Main app features

### Climate analytics

The app loads [`data/eastern-washington-power.json`](./data/eastern-washington-power.json),
a compact export generated from the executed NASA POWER notebook. It contains:

- Monthly temperature, precipitation, solar radiation, and stress-risk series.
- Coordinate-point metadata and sample observations.
- Three exploratory K-Means environmental zones.
- Zone sizes, labels, meanings, and average stress scores.
- Random Forest feature importance.
- Accuracy, precision, recall, F1, and confusion-matrix results.
- Stress-risk proxy mean, median, and maximum.

The stress score is a transparent proxy built from heat, frost, and low
precipitation. It is not measured crop stress, yield, soil moisture, or a causal
effect.

### Environmental zones

K-Means groups observations with similar standardized weather features:

- **Cool and dry / frost-prone**
- **Warm and relatively dry**
- **Warm and wet / humid**

These are exploratory climate regimes, not official agroclimate classifications
or field boundaries.

### Predictive model

The notebook uses a Random Forest classifier to estimate a next-day
weather-derived stress proxy. Current holdout results are approximately:

- Accuracy: 89.5%
- Precision: 78.1%
- Recall: 63.3%
- F1: 0.699

The strongest current feature is minimum temperature (`T2M_MIN`). These metrics
evaluate a proxy target on a chronological holdout; they do not prove future crop
performance.

### Commodities analytics

[`commodities dataset.ipynb`](./commodities%20dataset.ipynb) loads the external
`Commodities.numbers` workbook and writes
[`data/commodities-analytics.json`](./data/commodities-analytics.json).

The app provides:

- A commodity filter and grouped summary table.
- Record-count and mean-price charts.
- Variable explanations for `Commodity`, `Data Item`, `Value`, `Period`, `Year`,
  and `CV (%)`.
- Commodity classification metrics.
- Price-prediction metrics.

The current export contains 5,299 usable records across 45 commodity groups.

#### Commodity classification

The selected classification algorithm is **TF-IDF plus Logistic Regression**.
It predicts the `Commodity` label from structured text in `Data Item`, `Domain`,
and `Period`. The current test accuracy is approximately 98.8% across 36 retained
classes. This tests whether the dataset's labels can be recognized; it is not an
agronomic classifier.

#### Commodity price prediction

The selected predictive algorithm is a **Random Forest Regressor**. It predicts
numeric `Value` for records whose `Data Item` contains `PRICE RECEIVED`, using
commodity, year, period, state, and survey metadata.

Current baseline results are approximately:

- MAE: 130.60
- RMSE: 294.35
- R²: 0.51

`Value` units vary by `Data Item`, so price values must only be compared within
the same measure. These results are a baseline, not a financial forecast.

## Survey and rotation simulator

The seven-step survey uses:

1. A bounded Eastern Washington farm marker and optional address/county.
2. Recent Washington commodities such as wheat, barley, corn, potatoes, beans,
   peas, onions, and hops.
3. A seasonal planting window aligned with monthly climate summaries.
4. Water access: rainfed, partially irrigated, fully irrigated, or unknown.
5. Up to two priorities: profit, water, soil, risk, and stable yields.
6. Practical constraints: equipment, markets, cost, crop avoidance, or none.
7. Field size in acres, soil type, and budget flexibility.

All questions stay on the current step until the user clicks Next question or See recommendation. The recommendation is
calculated from:

- Climate stress-risk context.
- Selected water access and season.
- Recent commodity categories.
- Soil type.
- Field size.
- Budget, equipment, and market constraints.
- Farmer priorities.

The simulator compares:

- **Conventional rotation** — baseline comparison with the lowest operational
  change.
- **Rotation + cover crops** — soil-cover option with higher establishment demand.
- **Alternative cover crop mix** — lower-water alternative intended to balance
  soil protection and establishment risk.

After survey submission, the selected strategy is labeled **Best fit for your
inputs**. The displayed moisture estimate, fit scores, confidence text, tradeoffs,
and explanation are recalculated from the survey and climate proxy rather than
remaining fixed illustrative values.

## Causal analysis status

The interface explains causal analysis as the question:

> Did a cover crop improve the outcome?

A valid causal estimate would require field-level treatment assignment, comparable
control fields, measured soil-moisture or yield outcomes, management history, and
uncertainty estimates. The current NASA POWER and commodities files do not contain
those linked treatment/outcome records. Therefore the app explicitly reports that a
causal effect is **not estimable from the current datasets** instead of displaying
a fabricated effect such as `+0.03 soil moisture`.

The predictive analysis is separate: it forecasts a weather-derived proxy and does
not prove that a rotation caused an outcome.

## Spatiotemporal SCM integration

[`data/scm-counterfactuals.json`](./data/scm-counterfactuals.json) contains the
current export of a demonstration **Spatiotemporal Dynamic DML plus Structural
Causal Model (SCM)** workflow. It combines NASA POWER agro-climatology with
USDA Cropland Data Layer (CDL) rotations, NASS yields, ERS costs, and NRCS
SSURGO soil properties.

The app uses this export to:

- Display selectable 10 km parcel markers on the survey map.
- Match a survey location to the nearest SCM parcel.
- Compare conventional monoculture, legume/cover rotation, and low-water pulse
  counterfactuals.
- Show simulated yield, production cost, net return, ending soil health, and
  profit gain per acre.
- Display heatwave/drought and neighboring-irrigation-spillover scenarios.
- Render Dynamic DML moisture lag weights, counterfactual yields, counterfactual
  soil health, and a selected parcel's soil-health trajectory.
- Apply the selected parcel's values to the recommendation cards while retaining
  the survey inputs and explanatory context.

These are model-based counterfactual demonstrations, not measured field
experiments or validated causal effects. The export should be regenerated and
reviewed when source datasets, assumptions, or model code change.

## Notebook files and data flow

### `dataset experimentation nasa.ipynb`

The NASA POWER notebook:

- Loads `power_df3_c.numbers`.
- Defines the climate variable meanings.
- Cleans and validates the dataframe.
- Calculates heat, frost, dry-condition, and combined stress proxies.
- Runs K-Means environmental-zone clustering.
- Runs the Random Forest next-day proxy model.
- Produces statistical tables, graphs, feature importance, metrics, and
  conclusions.

### `commodities dataset.ipynb`

The commodities notebook:

- Loads `Commodities.numbers`.
- Documents the dataset variables.
- Filters and groups by commodity.
- Isolates price-received observations.
- Runs commodity classification.
- Runs Random Forest price prediction.
- Produces charts, metrics, predictions, and the app export.

The source `.numbers` workbooks are local research inputs and are not committed
to this repository. Update the absolute source paths in the notebooks when
running them on another machine.

### Generated application data

The browser loads static exports at runtime:

- `data/eastern-washington-power.json` — climate observations, zones, stress
  proxy, and predictive diagnostics.
- `data/commodities-analytics.json` — Washington commodity summaries and model
  metrics.
- `data/scm-counterfactuals.json` — parcel-level SCM counterfactuals and
  Dynamic DML results.
- `data/eastern-washington.geojson` and `data/region-context.geojson` —
  geographic boundaries and map context.

The app does not call a backend API. Changes to these exports are published with
the static site deployment.

## Optional terrain workflow

[`scripts/terrain_analysis.py`](./scripts/terrain_analysis.py) accepts a NASA DEM
GeoTIFF and GeoJSON boundaries, then calculates elevation, slope, and steep-terrain
summaries. Optional NASA POWER climate retrieval is also supported.

Install dependencies:

```bash
python3 -m pip install -r requirements-terrain.txt
```

Run terrain processing:

```bash
python3 scripts/terrain_analysis.py --dem path/to/nasadem.tif
```

Run with the optional climate range:

```bash
python3 scripts/terrain_analysis.py \
  --dem path/to/nasadem.tif \
  --climate-start 2001-01-01 \
  --climate-end 2024-12-31
```

Large NASA raster files are intentionally not committed.

## Technology

- HTML, CSS, and vanilla JavaScript
- Leaflet 1.9.4 for both map views
- OpenStreetMap tiles and attribution
- Python, pandas, NumPy, scikit-learn, Matplotlib, and `numbers-parser` for
  notebook experiments
- Optional GeoPandas and Rasterio for terrain processing
- MP4/WebM video assets for the opening sequence
- Static Vercel deployment

There is no frontend build step or package manifest. Leaflet is loaded from a
public CDN.

## Run locally

From the repository root:

```bash
python3 -m http.server 8000
```

Open <http://localhost:8000>.

Use an HTTP server rather than opening `index.html` directly so JSON data files,
Leaflet assets, and notebook-derived exports load correctly.

## Deploy with Vercel

The project is configured as a static site through [`vercel.json`](./vercel.json).
To deploy manually:

```bash
npx vercel --prod
```

The current production alias is:

<https://nasaspaceapp2026causualfarm.vercel.app>

The production deployment is made from the `main` branch. The `experiment`
branch was promoted into `main` after the SCM, interface, map, and opening
sequence work was integrated. Deploying manually from the repository root
publishes the current checkout:

```bash
npx vercel deploy --prod --yes
```

## Validation

Useful checks after changing the app:

```bash
node --check app.js
python3 -m json.tool data/eastern-washington-power.json
python3 -m json.tool data/commodities-analytics.json
python3 -m json.tool data/scm-counterfactuals.json
git diff --check
```

To re-execute the notebooks:

```bash
jupyter nbconvert --to notebook --execute --inplace \
  "dataset experimentation nasa.ipynb" \
  --ExecutePreprocessor.timeout=600

jupyter nbconvert --to notebook --execute --inplace \
  "commodities dataset.ipynb" \
  --ExecutePreprocessor.timeout=600
```

## Limitations and responsible use

This is an exploratory prototype. It does not provide validated crop-yield
forecasts, measured soil-moisture predictions, causal treatment effects, or
guaranteed commodity prices.

Before real-world use, the project needs:

- Field-level treatment and outcome data for causal inference.
- Soil, irrigation, management, and crop-stage records.
- Satellite vegetation indices such as NDVI.
- Time-aware validation across seasons and locations.
- Uncertainty intervals, sample sizes, and calibration checks.
- Agronomic review and farmer testing.

Use the app to understand data relationships and compare hypotheses, not as a
substitute for local agronomic, financial, or operational advice.
