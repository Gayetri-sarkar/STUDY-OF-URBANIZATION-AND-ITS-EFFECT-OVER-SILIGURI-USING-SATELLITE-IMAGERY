/**
 * INSTRUCTIONS FOR REUSE
 * ---------------------------------------
 * This script uses custom assets stored under the author's GEE account.
 * If you are forking or reusing this script:
 * 
 * 1. Upload your own shapefiles or FeatureCollections to your GEE assets.
 * 2. Replace all 'users/...' or 'projects/...' asset paths accordingly.
 * 3. Make sure your GCPs (training data) are labeled using the same property name ('landcover').
 * 
 * For help on uploading assets: https://developers.google.com/earth-engine/importing
 */

// IMPORTANT: Replace asset paths with your own if you fork this script
// You must upload FeatureCollections to your GEE Assets and update the paths accordingly.

// Study area boundary
var urban = ee.FeatureCollection("");

// Sentinel-2 MSI image collection (Level-1C)
var s2 = ee.ImageCollection("COPERNICUS/S2");

// GCP FeatureCollections (replace with your asset paths)
var urban_area = ee.FeatureCollection("");    // Urban training
var bare_area  = ee.FeatureCollection("");     // Bare land training
var water_area = ee.FeatureCollection("");    // Water body training
var veg_area   = ee.FeatureCollection("");      // Vegetation training 

// ALOS Digital Surface Model (30m elevation)
var alos = ee.ImageCollection("JAXA/ALOS/AW3D30/V3_2");

//  define the area
var filtered = urban.filter(ee.Filter.eq('UC_NM_MN','Siliguri'))
var geometry = filtered.geometry();
Map.centerObject(geometry,13);

// Visualization Parameters
var rgbVis = {
  min: 0.0,
  max: 3000,
  bands: ['B4', 'B3', 'B2'],
};

// Filter Sentinel-2 from given range
function getS2Image(start, end) {
  return s2
    .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 30))
    .filterDate(start, end)
    .filterBounds(geometry)
    .select('B.*');
}

var image2020 = getS2Image('2020-01-01', '2021-01-01');
var image2024 = getS2Image('2024-01-01', '2025-01-01');

image2020 = image2020.median();
image2024 = image2024.median();


// Add indices
var addIndices = function(image) {
  var ndvi = image.normalizedDifference(['B8', 'B4']).rename(['ndvi']);
  var ndbi = image.normalizedDifference(['B11', 'B8']).rename(['ndbi']);
  var mndwi = image.normalizedDifference(['B3', 'B11']).rename(['mndwi']); 
  var bsi = image.expression(
      '(( X + Y ) - (A + B)) /(( X + Y ) + (A + B)) ', {
        'X': image.select('B11'), 
        'Y': image.select('B4'),  
        'A': image.select('B8'), 
        'B': image.select('B2'), 
  }).rename('bsi');
  return image.addBands(ndvi).addBands(ndbi).addBands(mndwi).addBands(bsi);
};

image2020 = addIndices(image2020);
image2024 = addIndices(image2024);

var proj = alos.first().projection();
var elevation = alos.select('DSM').mosaic()
  .setDefaultProjection(proj)
  .rename('elev');
var slope = ee.Terrain.slope(elevation)
  .rename('slope');
  
image2020 = image2020.addBands(elevation).addBands(slope);
image2024 = image2024.addBands(elevation).addBands(slope);

//  Visualize RGB
Map.addLayer(image2020.clip(geometry), rgbVis, 'RGB 2020');
Map.addLayer(image2024.clip(geometry), rgbVis, 'RGB 2024');

// Normalize all bands in the image using min-max scaling
function normalize(image){
  var bandNames = image.bandNames();
  var minDict = image.reduceRegion({
    reducer: ee.Reducer.min(),
    geometry: geometry,
    scale: 10,
    maxPixels: 1e9,
    bestEffort: true,
    tileScale: 16
  });
  var maxDict = image.reduceRegion({
    reducer: ee.Reducer.max(),
    geometry: geometry,
    scale: 10,
    maxPixels: 1e9,
    bestEffort: true,
    tileScale: 16
  });
  var mins = ee.Image.constant(minDict.values(bandNames));
  var maxs = ee.Image.constant(maxDict.values(bandNames));

  var normalized = image.subtract(mins).divide(maxs.subtract(mins));
  return normalized;
}

image2020 =  normalize(image2020);
image2024 =  normalize(image2024);

// Prepare training data (merge labeled features: urban, water, vegetation, etc.)
var gcps = urban_area.merge(bare_area).merge(water_area).merge(veg_area);
gcps = gcps.randomColumn();

var trainingGcp = gcps.filter(ee.Filter.lt('random', 0.6));
var validationGcp = gcps.filter(ee.Filter.gte('random', 0.6));


// Visualization of classification
var classVis = {
  min: 0,
  max: 3,
palette: ['#e60000', '#ff9900', '#3399ff', '#33cc33']
};


// Train classifier on 2020 image
var training2020 = image2020.sampleRegions({
  collection: trainingGcp,
  properties: ['landcover'],
  scale: 10,
  tileScale: 16
});

var classifier2020 = ee.Classifier.smileRandomForest(100).train({
  features: training2020,
  classProperty: 'landcover',
  inputProperties: image2020.bandNames()
});
var classified2020 = image2020.classify(classifier2020);

Map.addLayer(classified2020.clip(geometry), classVis, 'Classified 2020');

var validation2020 = classified2020.sampleRegions({
  collection: validationGcp,
  properties: ['landcover'],
  scale: 10,
  tileScale: 16
});
print('Accuracy 2020:', validation2020.errorMatrix('landcover', 'classification').accuracy());

// Classify 2024 images
var training2024 = image2024.sampleRegions({
  collection: trainingGcp,
  properties: ['landcover'],
  scale: 10,
  tileScale: 16
});

var classifier2024 = ee.Classifier.smileRandomForest(100).train({
  features: training2024,
  classProperty: 'landcover',
  inputProperties: image2024.bandNames()
});
var classified2024 = image2024.classify(classifier2024);
Map.addLayer(classified2024.clip(geometry), classVis, 'Classified 2024');
var validation2024 = classified2024.sampleRegions({
  collection: validationGcp,
  properties: ['landcover'],
  scale: 10,
  tileScale: 16
});
print('Accuracy 2024:', validation2024.errorMatrix('landcover', 'classification').accuracy());

var changeMap = classified2024.neq(classified2020).selfMask();
Map.addLayer(changeMap.clip(geometry), {palette: ['#dbdbdb']}, 'Change Map (Class Difference)');


// Define the pixel area in square meters
var pixelArea = ee.Image.pixelArea();  // gives area per pixel in m²

// Calculate area of changed pixels
var changedAreaImage = changeMap.multiply(pixelArea);

// Sum up area within the geometry
var changedAreaStats = changedAreaImage.reduceRegion({
  reducer: ee.Reducer.sum(),
  geometry: geometry,
  scale: 10,  // assuming Sentinel-2 (adjust if different)
  maxPixels: 1e13
});

// Get total changed area in km²
var changedAreaSqKm = ee.Number(changedAreaStats.get('classification')).divide(1e6);

// Calculate total area of ROI
var totalAreaSqKm = ee.Number(geometry.area()).divide(1e6);

// Calculate percentage change
var changePercentage = changedAreaSqKm.divide(totalAreaSqKm).multiply(100);

// Print results
print('Changed Area (km²):', changedAreaSqKm);
print('Total Area (km²):', totalAreaSqKm);
print('Percentage of Area Changed (%):', changePercentage);

// Calculate NDVI change between 2024 and 2020
var ndviChange = image2024.select('ndvi').subtract(image2020.select('ndvi')).rename('NDVI_Change');

// Visualization parameters for NDVI change map
// - '#d73027' → NDVI decrease (likely vegetation loss)
// - '#ffffbf' → No significant change
// - '#1a9850' → NDVI increase (likely vegetation gain)

var ndviChangeVis = {min: -0.5, max: 0.5, palette: ['#d73027', '#ffffbf', '#1a9850']};
// Add NDVI change layer to the map
Map.addLayer(ndviChange.clip(geometry), ndviChangeVis, 'NDVI Change');

// Detect significant vegetation loss (NDVI drop below -0.2)
var vegLoss = ndviChange.lt(-0.2).selfMask();
// Detect significant vegetation gain (NDVI rise above +0.2)
var vegGain = ndviChange.gt(0.2).selfMask();

// Add vegetation loss (red) to map
Map.addLayer(vegLoss.clip(geometry), {palette: ['red']}, 'Vegetation Loss');
// Add vegetation gain (green) to map
Map.addLayer(vegGain.clip(geometry), {palette: ['green']}, 'Vegetation Gain');

/** 
  *To export results to Google Drive, uncomment the following export blocks
**/  

// // export classified 2020
// Export.image.toDrive({
//   image: classified2020.clip(geometry),
//   description: 'Classified_2020_Siliguri',
//   folder: 'EarthEngineExports',
//   fileNamePrefix: 'classified_2020_siliguri',
//   region: geometry,
//   scale: 10,
//   maxPixels: 1e13
// });

// // export classified 2024
// Export.image.toDrive({
//   image: classified2024.clip(geometry),
//   description: 'Classified_2024_Siliguri',
//   folder: 'EarthEngineExports',
//   fileNamePrefix: 'classified_2024_siliguri',
//   region: geometry,
//   scale: 10,
//   maxPixels: 1e13
// });

// // Export Change Map
// Export.image.toDrive({
//   image: changeMap.clip(geometry),
//   description: 'ChangeMap_Siliguri',
//   folder: 'EarthEngineExports',
//   fileNamePrefix: 'change_map_siliguri',
//   region: geometry,
//   scale: 10,
//   maxPixels: 1e13
// });

// // Export NDVI Change
// Export.image.toDrive({
//   image: ndviChange.clip(geometry),
//   description: 'NDVI_Change_Siliguri',
//   folder: 'EarthEngineExports',
//   fileNamePrefix: 'ndvi_change_siliguri',
//   region: geometry,
//   scale: 10,
//   maxPixels: 1e13
// });

// // Export Vegetation Loss
// Export.image.toDrive({
//   image: vegLoss.clip(geometry),
//   description: 'Vegetation_Loss_Siliguri',
//   folder: 'EarthEngineExports',
//   fileNamePrefix: 'vegetation_loss_siliguri',
//   region: geometry,
//   scale: 10,
//   maxPixels: 1e13
// });

// // Export Vegetation Gain
// Export.image.toDrive({
//   image: vegGain.clip(geometry),
//   description: 'Vegetation_Gain_Siliguri',
//   folder: 'EarthEngineExports',
//   fileNamePrefix: 'vegetation_gain_siliguri',
//   region: geometry,
//   scale: 10,
//   maxPixels: 1e13
// });


// var changedAreaImage = changeMap.multiply(pixelArea);

// var vegLossArea = vegLoss.multiply(pixelArea);
// var vegGainArea = vegGain.multiply(pixelArea);

// // 4. Reduce regions to calculate sum of pixel areas (in m²)
// var areaStats = ee.Dictionary({
//   changed_area_m2: changedAreaImage.reduceRegion({
//     reducer: ee.Reducer.sum(),
//     geometry: geometry,
//     scale: 10,
//     maxPixels: 1e13
//   }).get('classification'),

//   veg_loss_m2: vegLossArea.reduceRegion({
//     reducer: ee.Reducer.sum(),
//     geometry: geometry,
//     scale: 10,
//     maxPixels: 1e13
//   }).get('ndvi_diff'),

//   veg_gain_m2: vegGainArea.reduceRegion({
//     reducer: ee.Reducer.sum(),
//     geometry: geometry,
//     scale: 10,
//     maxPixels: 1e13
//   }).get('ndvi_diff'),

//   total_area_m2: geometry.area()
// });

// // 5. Convert m² to km² and calculate % change
// var changed_km2 = ee.Number(areaStats.get('changed_area_m2')).divide(1e6);
// var total_km2 = ee.Number(areaStats.get('total_area_m2')).divide(1e6);
// var change_pct = changed_km2.divide(total_km2).multiply(100);

// var veg_loss_km2 = ee.Number(areaStats.get('veg_loss_m2')).divide(1e6);
// var veg_gain_km2 = ee.Number(areaStats.get('veg_gain_m2')).divide(1e6);
// var unchanged_km2 = total_km2.subtract(changed_km2);

// // 6. Assemble results as a Feature for CSV export
// var summary = ee.Feature(null, {
//   'Total_Area_km2': total_km2,
//   'Changed_Area_km2': changed_km2,
//   'Percentage_Changed': change_pct,
//   'Vegetation_Loss_km2': veg_loss_km2,
//   'Vegetation_Gain_km2': veg_gain_km2,
//   'Unchanged_Area_km2': unchanged_km2
// });

// // 7. Export to Drive as CSV
// Export.table.toDrive({
//   collection: ee.FeatureCollection([summary]),
//   description: 'change_area_summary',
//   fileFormat: 'CSV'
// });