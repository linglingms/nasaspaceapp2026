# TerraCycle AI prototype

This is a dependency-free front-end prototype for the TerraCycle AI hackathon concept.
It presents the recommended simple narrative:

1. Collect NASA environmental data and farm records.
2. Prepare one shared dataset organized by field and season.
3. Use causal analysis to ask **why** outcomes changed.
4. Use predictive analysis to ask **what comes next**.
5. Compare rotation strategies in a decision-support dashboard.

The opening project-purpose section is grounded in the NASA Space Apps challenge:
farmers face changing temperatures and rainfall, water shortages, extreme weather,
erosion, nutrient depletion, and declining soil health. The proposed tool uses NASA
Earth observations alongside local soil information, crop characteristics, and farmer
priorities to make rotation tradeoffs easier to explore. Its essential questions are:
what is changing, what helps under comparable conditions, and what comes next.

## Run locally

Open [index.html](./index.html) in a browser. No build step or package installation is required.

The numbers in the simulator are explicitly illustrative placeholders. They should be
replaced with validated model outputs, uncertainty intervals, and locally relevant data
before the interface is used for real farm decisions.

## Deployment

The site is configured to deploy through GitHub Pages using
[.github/workflows/deploy-pages.yml](./.github/workflows/deploy-pages.yml). After the
workflow completes, the repository's GitHub Pages settings will provide the public URL.
