# R-02: Terrain Elevation Data Source

Research item R-02 from `todo/00-research.md`. Blocks Phase 8 (Advanced RF Propagation).

**Use case:** Given a UAV position and a ground station position, sample the elevation
profile along the straight-line great-circle path between them, then compute Fresnel
zone clearance and diffraction loss. The backend is Django + PostGIS; heavy computation
runs in the Celery worker. Field deployments may be airgapped or have poor connectivity.

> Note: Web search/fetch were unavailable while preparing this document. Figures below
> reflect well-established public documentation as of the January 2026 knowledge cutoff.
> The licensing line items flagged with **[VERIFY]** should be confirmed against the
> current provider terms before Phase 8 implementation begins.

## Options evaluated

### SRTM 30m (SRTMGL1 v3 / NASADEM)

- **Source:** NASA/USGS Shuttle Radar Topography Mission, February 2000. The 1 arc-second
  global product (SRTMGL1, ~30 m at the equator) was released globally in 2014/2015.
  NASADEM (2020) is a reprocessing of the same radar data with improved void filling and
  ICESat-corrected heights — effectively the modern form of "SRTM 30m".
- **Coverage:** Land only, and critically **limited to 56 S - 60 N latitude**. No data
  above 60 N or below 56 S. This is a hard physical limitation of the Shuttle's orbital
  inclination, not a processing gap.
- **Resolution:** 1 arc-second horizontal (~30 m). Vertical accuracy roughly 16 m absolute
  / ~10 m relative (90% CI); NASADEM is somewhat better. It is a **DSM** (digital surface
  model) — radar returns reflect treetops and rooftops, not bare ground. For Fresnel
  obstruction this is arguably desirable (a tree canopy *does* obstruct RF), but it is
  inconsistent over partially vegetated terrain.
- **Known artifacts:** Voids in steep mountainous terrain and over water; "spikes" and
  "wells" from radar layover. NASADEM mitigates most of these.
- **Format:** 1 x 1 degree GeoTIFF / HGT tiles, ~25 MB each uncompressed. The full land
  dataset is on the order of tens of GB — entirely feasible to pre-stage on disk.
- **Offline:** Excellent. Tiles are static files; download once, serve forever. No API,
  no key, no network dependency at query time.
- **Licensing:** Public domain (U.S. Government work). Free for commercial use, no
  attribution legally required (attribution is courteous). **[VERIFY]** — confirm the
  specific distribution (SRTMGL1 v3 vs NASADEM) carries no added terms.

### Copernicus DEM GLO-30

- **Source:** ESA / Copernicus programme, derived from the TanDEM-X radar mission
  (acquisitions ~2011-2015), edited and quality-controlled by Airbus. GLO-30 is the
  globally free 30 m tier; GLO-90 is the 90 m tier; the 10 m WorldDEM tier is commercial.
- **Coverage:** **True global land coverage**, including high latitudes and polar regions
  — no 60 N / 56 S cutoff. This is the decisive advantage over SRTM.
- **Resolution:** 30 m horizontal (1 arc-second, with longitudinal grid spacing varying
  by latitude band). Vertical accuracy is excellent for a free DEM: ~4 m absolute (90% CI)
  and ~2 m relative — materially better than SRTM. Also a **DSM** (surface model).
- **Quality:** Edited product — water bodies flattened, coastlines and shorelines
  corrected, fewer voids and spikes than raw SRTM. Generally regarded as the best free
  global DEM available.
- **Format:** 1 x 1 degree GeoTIFF tiles. Hosted as a public dataset on AWS Open Data
  (`s3://copernicus-dem-30m/`) and on Microsoft Planetary Computer — both allow anonymous,
  no-key bulk download. Full global product is a few hundred GB but a deployment region
  is a small subset.
- **Offline:** Excellent. Same model as SRTM — static tiles, download once, serve from
  disk. Pre-stage the operational region(s) before deployment.
- **Licensing:** Free to use, including commercial use, under the Copernicus DEM licence.
  Attribution to "Copernicus DEM" / ESA / Airbus is **required**. There are use
  restrictions historically attached to the GLO products (e.g. limits on redistributing
  the data itself as a standalone product). **[VERIFY]** — read the current EULA; for our
  use (internal derived RF computations, not reselling the DEM) it is almost certainly
  fine, but confirm before shipping to customers.

### Mapbox Terrain-DEM (Terrain-RGB / Raster Tiles v1)

- **Source:** Mapbox-curated composite — blends SRTM, Copernicus and various national
  high-resolution DEMs. Delivered as Terrain-RGB raster tiles (elevation encoded in the
  RGB channels of PNG tiles) via the Mapbox tile API, or via the Tilequery / elevation
  endpoints.
- **Coverage:** Effectively global, and in many regions *better* than either free DEM
  because Mapbox merges in 1-10 m national datasets (US, much of Europe, etc.).
- **Resolution:** Variable by zoom and region — up to ~10 m or finer where premium
  national data exists, falling back to 30 m elsewhere. Highest *potential* accuracy of
  the four options.
- **Offline:** **Poor.** This is an online tile API gated behind an access token. The
  Mapbox Terms of Service restrict caching/storing tiles: temporary caching for
  performance is allowed, but building a permanent offline tile store is generally **not
  permitted** outside the Mapbox Offline SDK / enterprise "offline" agreements. An
  airgapped Celery worker cannot call the Mapbox API at all. **[VERIFY]** — current ToS
  caching clause and whether an enterprise/offline plan would lift the restriction.
- **Licensing:** Commercial, **usage-metered and billed**. Tile/API requests count
  against a monthly free allowance and then incur per-request charges. Requires a Mapbox
  account, an access token, and ongoing billing. Costs scale with the number of
  elevation-profile queries.
- **Verdict for us:** Disqualified by the offline requirement and the metered billing
  model. Good fit only for a purely online product.

### Open-Elevation

- **Source:** Free, community-run open-source elevation API (`open-elevation.com`). Backed
  by SRTM data. Can also be self-hosted from its GitHub project against SRTM tiles.
- **Coverage:** Inherits SRTM coverage — same **60 N / 56 S** limitation, land only.
- **Resolution:** Inherits SRTM (~30 m, ~16 m vertical). No improvement over option 1; it
  is just SRTM behind an HTTP wrapper.
- **Offline:** The *public* hosted API is online-only and historically **unreliable**
  (frequent downtime, rate limits, no SLA) — unsuitable for a production or field system.
  However, the project is open source and **self-hostable**: you can run the Open-Elevation
  server in a container next to Django, pointed at locally stored SRTM tiles. Self-hosted,
  it works fully airgapped.
- **Licensing:** Open-Elevation software is GPL-licensed; the data served is SRTM (public
  domain). Free for commercial use.
- **Verdict for us:** The public API is not production-grade. Self-hosting Open-Elevation
  is functionally equivalent to "self-host SRTM ourselves" but adds an extra service to
  operate — not worth it when we can read tiles directly from PostGIS/GDAL in-process.

## Comparison table

| Criterion | SRTM 30m | Copernicus GLO-30 | Mapbox Terrain-DEM | Open-Elevation |
|---|---|---|---|---|
| Global coverage | Land, **60 N - 56 S only** | **True global land** | Global | Land, 60 N - 56 S (SRTM) |
| Horizontal resolution | ~30 m | ~30 m | 10 m - 30 m (varies) | ~30 m |
| Vertical accuracy (90% CI) | ~16 m abs | **~4 m abs** | ~2-10 m (varies) | ~16 m abs (SRTM) |
| Model type | DSM | DSM | DSM (composite) | DSM |
| Offline / airgapped | Excellent (static tiles) | Excellent (static tiles) | **Not viable** (online API) | Only if self-hosted |
| Commercial licensing | Public domain, free | Free, attribution required | **Metered, billed** | Free (GPL + SRTM) |
| Network dependency at query time | None | None | Required | Required (or self-host) |
| Operational cost | Storage only | Storage only | Per-request billing | Storage + extra service |
| Best free vertical accuracy | No | **Yes** | n/a (paid) | No |

## Recommendation

**Adopt Copernicus DEM GLO-30 as the primary terrain elevation source.**

Keep SRTM 30m / NASADEM as a documented secondary option only if a coverage or licensing
issue with Copernicus emerges — but there is no functional reason to prefer it given
Copernicus is strictly better on accuracy and coverage at the same price (free).

This is not an open question. The two tile-API options are clearly disqualified for an
application that must run airgapped, and between the two static-tile DEMs, Copernicus
wins on every axis that matters here.

## Reasoning

**Why Copernicus GLO-30 wins:**

- **Coverage is the dealbreaker for SRTM.** "Deployments may be anywhere" plus SRTM's hard
  60 N / 56 S cutoff means SRTM cannot be the primary source — any deployment in northern
  Canada, Alaska, Scandinavia, Antarctica, etc. would have *no data at all*. Copernicus
  has true global land coverage.
- **Accuracy directly affects the deliverable.** Fresnel zone clearance is sensitive to
  terrain height error: an obstacle that intrudes a few metres into the first Fresnel zone
  changes the diffraction-loss verdict. Copernicus's ~4 m absolute / ~2 m relative accuracy
  is roughly 4x better than SRTM's ~16 m, which meaningfully reduces false clear/obstructed
  calls.
- **It is a static file dataset.** Download 1 x 1 degree GeoTIFFs once, serve forever. No
  API key, no per-query network call, no vendor billing relationship. This is the only
  model compatible with airgapped operation.
- **Cleaner data.** Copernicus is an edited product (flattened water, fewer voids/spikes)
  so the Celery propagation code needs less defensive void-handling than with raw SRTM.
- **Cost is storage only.** A deployment region is a small subset of the few-hundred-GB
  global product; a country-sized AOI is a few GB.

**Why the alternatives were rejected:**

- **SRTM 30m** — rejected as primary purely on the 60 N / 56 S coverage gap and inferior
  vertical accuracy. It is otherwise fine (public domain, static tiles) and is retained as
  a fallback. The DSM-vs-DTM distinction is not a differentiator; both are DSMs.
- **Mapbox Terrain-DEM** — rejected on two independent grounds: (1) it is an online API
  and cannot serve an airgapped Celery worker, and its ToS restricts building a permanent
  offline tile cache; (2) it is metered and billed per request, creating an ongoing cost
  and a vendor dependency for what is otherwise a one-time static-data problem. Its higher
  resolution in premium regions is real but does not outweigh these.
- **Open-Elevation** — the public API is not production-grade (no SLA, frequent downtime,
  online-only). Self-hosting it is viable but is just "SRTM behind an HTTP service" — it
  adds an operational component and inherits SRTM's coverage gap. Reading Copernicus tiles
  directly in-process (GDAL/rasterio) is simpler and better.

## Caching strategy

The problem decomposes into two layers: caching the **raw DEM tiles** (the source data)
and caching the **computed elevation profiles** (the per-query results).

### Layer 1 - DEM tile store (the source data)

- **Pre-stage tiles on disk, do not fetch on demand.** Before any deployment, download the
  Copernicus GLO-30 1 x 1 degree GeoTIFF tiles covering the operational area(s) of
  interest from the AWS Open Data bucket (`s3://copernicus-dem-30m/`, anonymous access).
  Store them on a mounted volume, e.g. `data/dem/copernicus-glo30/`.
- **Build a tile index in PostGIS.** Create a table (e.g. `terrain_demtile`) with a
  `geometry(Polygon, 4326)` column for each tile's 1 x 1 degree footprint, plus the file
  path, source name, resolution, and a checksum. A GiST spatial index on the footprint
  makes "which tiles cover this path?" a fast bounding-box query. This keeps the DEM
  catalogue queryable from Django/ORM and lets the worker resolve a path to a tile set
  without scanning the filesystem.
- **Read elevations with GDAL/rasterio in the Celery worker.** For a profile query,
  intersect the great-circle path against `terrain_demtile`, open the matching GeoTIFF(s),
  and bilinearly sample elevation at evenly spaced points along the path (sample spacing
  no coarser than ~30 m to match the native resolution — there is no benefit to finer
  sampling than the data supports). PostGIS already ships GDAL via `raster2pgsql`; an
  alternative is to load tiles into a PostGIS `raster` column and use `ST_Value` /
  `ST_Band`, keeping everything in the database. Either is acceptable — start with
  on-disk GeoTIFF + rasterio for simplicity; move to PostGIS raster only if a single
  database round trip is preferred.

### Layer 2 - Computed profile / result cache

- Fresnel-zone computation along a fixed path is deterministic. Cache the *result* keyed
  by a hash of the rounded endpoint coordinates plus the sampling parameters and DEM
  source version, e.g. `hash(lat1,lon1,lat2,lon2,step,source_version)`.
- Store cached profiles in a PostGIS table (`terrain_pathprofile`) with the path geometry,
  the sampled elevation array, the computed clearance/diffraction result, and a
  `computed_at` timestamp. This survives worker restarts and is shareable across workers,
  unlike an in-process cache. Round endpoint coordinates to a sensible grid (e.g. 5-6
  decimal places, ~1 m) so near-identical re-queries hit the cache.
- Optionally front this with Django's cache framework (Redis) for hot, very recent
  profiles, but the durable PostGIS table is the source of truth.
- Invalidate the result cache when the DEM source/version changes (include the source
  version in the cache key, so a tile refresh naturally produces new keys).

### Cache misses in an airgapped environment

- **A cache miss must never trigger a network fetch in airgapped mode.** Make tile
  acquisition an explicit, offline provisioning step — never a lazy on-demand download.
- If a profile query touches a geographic area for which **no tile is staged**, the worker
  must fail loudly and explicitly: return a structured "elevation data unavailable for
  this region" result rather than silently assuming flat terrain (a flat-terrain
  assumption would produce a falsely optimistic Fresnel clearance — a safety-relevant
  error for RF link planning).
- Provide a management command (e.g. `manage.py fetch_dem_tiles --bbox ...`) used during
  provisioning while connectivity exists, plus a `manage.py verify_dem_coverage` check
  that reports which staged tiles cover a planned AOI. Run coverage verification as part
  of deployment readiness.

## Coverage gaps and fallback

- **Ocean / large water bodies:** DEMs cover land. Over water, treat elevation as 0 m
  (sea level) — correct for RF purposes (a sea surface is the obstruction plane).
- **Polar regions / extreme latitudes:** Copernicus GLO-30 covers these; SRTM does not.
  This is a primary reason for choosing Copernicus.
- **Residual voids in Copernicus GLO-30:** Few, but they exist in some steep terrain.
  Detect the dataset's nodata value when sampling; interpolate small voids from neighbours
  and flag the profile as containing interpolated data.
- **Areas with no staged tiles (airgapped):** Handled as an explicit error (see Cache
  misses above) — surface "no terrain data for this region" to the operator. Do not
  fabricate terrain.
- **Fallback chain:**
  1. Copernicus GLO-30 staged tile (primary).
  2. SRTM / NASADEM staged tile, if present and the location is within 60 N - 56 S
     (secondary — only if a Copernicus tile is missing or void-heavy for that cell).
  3. No data -> explicit "elevation unavailable" result; the RF model should either skip
     terrain-aware computation for that link (falling back to the existing
     non-terrain propagation model) and clearly label the result as "terrain not
     modelled", or refuse to produce a clearance verdict. Decide which in Phase 8 design.

## Owner responses — 2026-05-18

- **Deployment area:** Primarily New Zealand. The owner has access to **LINZ 10m contour and spot-heights data**, which is higher resolution than any free global DEM and should be the primary source for NZ deployments.
- **Architecture pivot:** Rather than hardcoding a single source, the system should expose a **pluggable elevation provider interface**. The NZ LINZ data is loaded via an optional locally-deployed service (separate project, optional dependency). Users may register additional providers. Two built-in providers ship: NZ LINZ (primary for NZ) and Copernicus GLO-30 (public fallback elsewhere).
- **Airgapped operation:** Yes, a hard requirement for field deployments. Tile pre-staging and loud failure on cache-miss are correct.
- **Service model:** The elevation data service is not part of this project but is an optional dependency — design the interface so any conforming service can be plugged in.

**Decision: Pluggable elevation provider interface. Built-in providers: NZ LINZ 10m (primary) + Copernicus GLO-30 (public fallback). [R-02] closed.**

---

## Open questions

- **Confirm the Copernicus DEM EULA for our use case [VERIFY].** Our use (internal RF
  computation, derived results shipped to customers, the DEM itself not redistributed) is
  almost certainly permitted, but the current Copernicus DEM licence and any GLO-30
  redistribution restrictions should be read and recorded before Phase 8 ships to
  customers. Confirm the required attribution string.
- **Confirm SRTMGL1 v3 / NASADEM carries no added distribution terms [VERIFY].** Expected
  to be public domain; verify.
- **DSM vs DTM for Fresnel modelling.** Both recommended DEMs are surface models (include
  canopy/buildings). Is that the desired behaviour for obstruction detection? For RF,
  modelling the canopy as an obstruction is generally *correct*, but the owner should
  confirm — if bare-earth terrain is wanted, a DTM source would be a different research item.
- **Per-deployment AOI provisioning process.** Who decides which regions to pre-stage, and
  how far ahead of deployment? This needs an operational owner. Global pre-staging
  (a few hundred GB) is also feasible if storage allows and simplifies provisioning.
- **Storage budget.** Confirm the deployment target has room for the staged tile set
  (region subset = a few GB; full global GLO-30 = a few hundred GB).
- **Is guaranteed airgap support a hard requirement, or only "poor connectivity"?** If
  *some* connectivity is always available, an online tile API (e.g. Mapbox) could be
  reconsidered for its higher resolution. The recommendation here assumes airgapped
  operation must be fully supported, which is what disqualifies the API options.
- **PostGIS raster vs on-disk GeoTIFF.** Decide in Phase 8 implementation whether to load
  DEM tiles into a PostGIS `raster` column (single DB round trip, `ST_Value`) or keep them
  as on-disk GeoTIFFs read via rasterio. Both work; this is an implementation-detail
  decision, not a blocker.
