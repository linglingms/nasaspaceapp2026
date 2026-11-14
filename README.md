# TerraCycle AI

TerraCycle AI is a dependency-free front-end prototype for a farmer-friendly crop
rotation decision-support tool. The app combines a clear project narrative, an
interactive region map, two analysis concepts, and a rotation scenario simulator.

**Open-source repository:** [github.com/linglingms/nasaspaceapp2026](https://github.com/linglingms/nasaspaceapp2026)

## Project purpose

Farmers face increasingly complex decisions as temperatures shift, rainfall becomes
less predictable, and soil health declines across many regions. Water shortages,
erosion, nutrient depletion, and extreme weather events add further uncertainty.
Selecting new crops to add to a rotation can be difficult because a crop that improves
soil health in one place may consume too much water, introduce disease, conflict with
local markets, or fall outside expected growing seasons somewhere else.

This concept is inspired in part by multigenerational farming experience. Many
families have lived through seasons where better tools for tracking changing
conditions could have helped identify healthier, more resilient rotation choices.
NASA's long-term environmental datasets offer new ways to understand local growing
conditions, while science-informed techniques can translate those observations into
practical, farmer-friendly insights.

The prototype is framed around the NASA Space Apps challenge: use NASA Earth
observations together with local soil information, crop characteristics, and farmer
priorities to help farmers explore rotation strategies that could protect fields,
conserve water, and strengthen long-term resilience.

## Essential questions

The dashboard is organized around three questions:

1. **What is changing?** How are temperature, rainfall, soil moisture, and vegetation
   conditions shifting?
2. **What helps?** Which rotation choices are associated with healthier soil and
   vegetation under comparable conditions?
3. **What comes next?** Which options balance water use, growing seasons, disease risk,
   markets, and farmer priorities?

## Features

### Project introduction

The top of the dashboard explains the farming challenge, the multigenerational
inspiration, the NASA connection, and the decision-support purpose before presenting
the technical workflow.

### NASA Space Apps branding

The header includes the NASA insignia and a NASA Space Apps prototype label. The
NASA logo is loaded from NASA's public website.

### Interactive focus-area map

The Leaflet/OpenStreetMap map provides three illustrative areas:

- Great Plains, USA — wheat, corn, and sorghum; water conservation
- Central Valley, USA — rice, almonds, and tomatoes; water availability
- East Africa — maize, beans, and sorghum; rainfall resilience

Users can click a map region or an area button to update the selected area's example
crops, terrain, and planning focus. **Use this area** confirms the selection and moves
the user into the simulator flow.

These are placeholder regions for demonstrating the interface. They are not live farm
boundaries, real field measurements, or live NASA data layers yet.

### GeoPandas terrain baseline

The repository now includes a baseline terrain-processing workflow in
[`scripts/terrain_analysis.py`](./scripts/terrain_analysis.py). It accepts a NASA DEM
GeoTIFF and the example boundaries in [`data/farming_regions.geojson`](./data/farming_regions.geojson),
then calculates mean/minimum/maximum elevation, mean slope, and the percentage of
steep terrain. The generated GeoJSON is loaded automatically by the Leaflet map when
it exists; otherwise the map keeps its placeholder circles.

Install the optional processing dependencies and run:

```bash
python3 -m pip install -r requirements-terrain.txt
python3 scripts/terrain_analysis.py --dem path/to/nasadem.tif
```

The DEM is intentionally not committed to the repository because NASA raster files
are large. Use a NASADEM/SRTM GeoTIFF covering the selected regions. The generated
`data/terrain-analysis.geojson` is a derived artifact and should be regenerated when
the DEM or boundaries change.

To add climate analysis, provide a date range. The script queries NASA POWER at
each region centroid, adds mean temperature and total precipitation, and fits a
transparent linear trend baseline for the next year:

```bash
python3 scripts/terrain_analysis.py \
  --dem path/to/nasadem.tif \
  --climate-start 2001-01-01 \
  --climate-end 2024-12-31
```

The climate fields are exploratory baselines, not validated forecasts. For a
production predictive model, use the exported climate fields alongside field
management, soil, and satellite features in a time-aware training pipeline.
Only expose predictions when a held-out evaluation set supports them, and display
uncertainty and sample size next to each estimate.

### Two analysis engines

- **Causal analysis — Why?** Compares fields with and without a strategy while
  accounting for environmental and management differences.
- **Predictive analysis — What next?** Uses historical environmental patterns to
  forecast future soil moisture and vegetation conditions.

The page also includes an empty chart and schema scaffold for future integration.
The planned data model includes field identifiers, observation dates, soil moisture,
rainfall, rotation method, vegetation index, elevation, slope, soil type, crop stage,
irrigation, and uncertainty. The blank chart is intentionally not presented as a
real forecast until validated NASA and local field data are connected.

The interface keeps methods such as causal inference, causal forests, Random Forest,
and XGBoost in the background so the primary user flow remains understandable.

### Rotation scenario simulator

The simulator compares three illustrative strategies:

- Conventional rotation
- Rotation plus cover crops
- Alternative cover crop mix

It displays estimated soil moisture, vegetation health, drought resilience, and a
confidence label. All values are explicitly illustrative placeholders.

The page also explains how each method works in practice: the conventional sequence,
cover-crop timing and termination, and the species-selection and management tradeoffs
of an alternative cover-crop mix. These explanations are educational context, not
prescriptions for a particular farm.

## Technology

- HTML, CSS, and vanilla JavaScript
- Leaflet 1.9.4 for the interactive map
- Optional GeoPandas, Rasterio, and NumPy terrain preprocessing
- OpenStreetMap tiles and attribution
- No package installation or build step
- Vercel-compatible static deployment

## Run locally

Open [index.html](./index.html) in a browser. Because the map uses public CDN assets,
an internet connection is needed for the Leaflet library and map tiles.

For a local HTTP server, use any static server, for example:

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

## Deployment with Vercel

The site is configured as a static Vercel project through
[vercel.json](./vercel.json). To deploy:

1. Sign in at [vercel.com/new](https://vercel.com/new).
2. Import `linglingms/nasaspaceapp2026` from GitHub.
3. Use **Other** as the framework preset.
4. Leave the build command empty and set the output directory to `.`.
5. Select **Deploy**.

Once the repository is connected, future pushes to `main` deploy automatically.

## Data and modeling disclaimer

This repository currently contains a user-interface prototype, not a validated
agricultural model. Before real-world use, the illustrative values and placeholder
areas must be replaced with validated NASA and local datasets, field boundaries,
appropriate uncertainty intervals, model evaluation, and locally relevant agronomic
and farmer-priority inputs. The interface is decision support, not automated farm
advice.

## Validation and project history

The project has been validated with:

- `node --check app.js`
- `git diff --check`

Recent project milestones:

- Built the initial TerraCycle AI dashboard and rotation simulator
- Added the NASA Space Apps challenge purpose and essential questions
- Added the NASA insignia to the header
- Added the interactive crop and terrain focus-area map
- Switched deployment guidance from GitHub Pages to Vercel
- Added the centered open-source repository link to the dashboard header
