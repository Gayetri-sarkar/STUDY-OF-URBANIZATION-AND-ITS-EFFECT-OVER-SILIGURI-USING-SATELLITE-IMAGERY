# Study of Urbanization and Its Effects over Siliguri Using Satellite Imagery
This project investigates land cover transformation and vegetation dynamics in Siliguri, India, from 2020 to 2024 using Sentinel-2 and ALOS DSM satellite data processed via Google Earth Engine (GEE) and visualized in QGIS.

# Study Area
* Location: Siliguri Municipal Corporation, West Bengal, India.
* Geometry Source: Filtered from a national urban boundary dataset using 'UC_NM_MN' = 'Siliguri'

# Data Sources
* Sentinel-2 MSI: Multispectral imagery (10m resolution, Bands B2–B12)
* ALOS DSM: Digital surface model used for elevation and slope
* Ground Control Points (GCPs): Manually digitized training/validation for:
- Urban areas,
- Vegetation,
- Water bodies,
- Barren land.

# Tools
Google Earth Engine,
Sentinel-2,
ALOS DSM,
QGIS.

# Methodology
# 1. Preprocessing
* Filtered Sentinel-2 images (cloud cover < 30%)
* Created median composites for 2020 and 2024
* Computed spectral indices:
* NDVI (Normalized Difference Vegetation Index)
* NDBI (Normalized Difference Built-up Index)
* MNDWI (Modified NDWI)
* BSI (Bare Soil Index)
* Integrated elevation and slope layers from ALOS DSM
* Normalized all bands for classification consistency
# 2. Training & Classification
* Merged GCPs into a single FeatureCollection
* Applied a Random Forest classifier with 100 trees
* Performed supervised classification on both years
* Split GCPs (60% training, 40% validation)
* Assessed accuracy using confusion matrices
# 3. Change Detection
* Class Change Map: Created using classified2024.neq(classified2020)
* NDVI Change Map: Calculated as NDVI_2024 - NDVI_2020
* Vegetation Loss: NDVI < -0.2 (colored red)
* Vegetation Gain: NDVI > +0.2 (colored green)
* All layers were clipped to the Siliguri boundary
# 4. Area Analysis
* Used pixelArea() and .reduceRegion() to compute:
* Total change area (in km²)
* % change relative to study area
* Vegetation loss and gain zones
# 5. Post-Processing in QGIS
* Exported maps (.tif) from GEE
* Applied categorized/pseudocolor symbology
* Generated final map layouts for reporting and visualization
* Note: All Earth Engine code blocks are available in code/change_detection_siliguri_2020_2024.js.
* To export results, uncomment the Export.
* sections and run inside the GEE Code Editor.

# Results Summary




# Folder Structure
* '' code/ '': Main GEE script
* '' documents/ '' – project report, and presentation used for academic submission
* '' results/ '': Exported change maps and accuracy reports
* '' screenshots/ '': Map previews for visualization
