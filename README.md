# Death's Coffer Finder V5

A Spring Boot website for finding Old School RuneScape Grand Exchange items that may provide good value when sacrificed to Death's Coffer.

## What V5 adds

- Public-site-ready OSRS-inspired responsive design
- Best realistic buys cards
- All profitable / Recommended / High liquidity / Big GP saving presets
- Automatic 60-second market refresh
- Data freshness and scan-time indicators
- Persistent filters using browser local storage
- Sort indicators and column explanations
- Mobile-friendly layout and horizontally scrollable market table
- `/health` endpoint for hosting checks
- `Dockerfile` and `render.yaml` for Render deployment
- Git-ready `.gitignore`

## Run in IntelliJ

1. Open this folder in IntelliJ.
2. Allow Maven to import dependencies.
3. Use Java 21.
4. Run `CofferFinderApplication.java`.
5. Open `http://localhost:8080`.

## Deploy to GitHub + Render

1. Create a GitHub repository and push the contents of this folder to it.
2. In Render, choose **New > Blueprint** and connect the GitHub repository.
3. Render will read `render.yaml` and deploy the Docker service.
4. Health check path is `/health`.

You can also create a normal Render Web Service from the repository and choose Docker as the runtime.

## Price logic

The backend combines:

- OSRS Wiki / RuneLite real-time price observations for current market prices and volume.
- RuneLite's bulk Jagex GE price snapshot for the official guide value.

The displayed coffer value is:

`official GE guide value × 1.05`

The website only treats items with an official GE value of at least 10,000 gp as baseline coffer-eligible candidates.

## Important

Real-time market prices are recent trade observations, not guaranteed buy offers. Low-volume items can move sharply, and special Death's Coffer restrictions can change. Check the in-game GE and current game rules before spending large amounts of GP.


## V5 item pages
Click any market row or quick-pick card to open a dedicated item details page with coffer maths, live buy/sell prices, volume, confidence, GE limit potential and data freshness.


## V5.4 visual theme
Uses the supplied castle image as the fixed site background with translucent medieval bronze/iron panels and irregular KAHA IS DARK graffiti.
