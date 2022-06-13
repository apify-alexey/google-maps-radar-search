## Features
Official Google Places API [Nearby search](https://developers.google.com/maps/documentation/places/web-service/search-nearby) can return as many as 60 results, split across three pages.
Actor overrides this limit and gets all places in a few kilometers radius around specified geopoint by doing distance search. Idea behind is to avoid anti-pattern as displayed below, since it leads to twice more API calls in order to get each additional 10% of results:
<p align="center">
<a href="https://raw.githubusercontent.com/apify-alexey/google-maps-radar-search/main/search-antipattern.png" target="_blank" rel="noopener noreferrer" onclick="window.open(this.href,'_blank');return false;"><img src="https://raw.githubusercontent.com/apify-alexey/google-maps-radar-search/main/search-antipattern.png" alt="" style="width: 468px; height: 419px;" width="468" height="419" /></a>
</p>
Instead (all further math references for 1Km search radius with 50 meters grid radius) we can:
- Create a grid from 2 x 2 km area with 100 x 100 m cells (from radius of 1000 and 50 meters)
- Based on inner margin we have 380 cells in bounding box or 312 cells inside the search circle
- Still, for high populated areas we can hit 60 places limit for a few cells
- If so, we add new 8 search points at half of cell radius around such cells
From a higher perspective even for Central Europe or USA we can find the best possible cell radius for given search distance and coordinates which will give us 99% of accuracy with minimal amount of API calls. Density of places will not be changed rapidly in days or months, so the right combination for each search will allow a rescan area to find new places and keep lowest running costs.
 
## External requirements
You need to obtain your own [Google API key](https://developers.google.com/maps/documentation/places/web-service/get-api-key)
 
## Cost of usage
- [Google rates](https://developers.google.com/maps/documentation/places/web-service/usage-and-billing#nearby-search) applied as usual: 32.00 USD per 1000 calls, therefore each run for 1km radius in populated area should save approx $10-20 on Google API charges.
 
### Input example
Search radius set to 1000 meters and grid radius set to 50 meters by default.
```jsonc
{
  "apiKey": "YOUR OWN GOOGLE API KEY",
  "latitude": "47.41168232410833",
  "longitude": "8.54417797274538",
  "radiusMeters": 1000
}
```
 
### Output example
Output saved exactly as it comes from Google API data feed with calculated `distanceMeters` (from search center) added to it.
```jsonc
{
  "distanceMeters": 920,
  "business_status": "OPERATIONAL",
  "geometry": {
    "location": {
      "lat": 47.4036189,
      "lng": 8.5419602
    },
    "viewport": {
      "northeast": {
        "lat": 47.4049176302915,
        "lng": 8.543189430291502
      },
      "southwest": {
        "lat": 47.4022196697085,
        "lng": 8.540491469708497
      }
    }
  },
  "icon": "https://maps.gstatic.com/mapfiles/place_api/icons/v1/png_71/generic_business-71.png",
  "icon_background_color": "#7B9EB0",
  "icon_mask_base_uri": "https://maps.gstatic.com/mapfiles/place_api/icons/v2/generic_pinlet",
  "name": "Dr. phil. Würth Josy",
  "place_id": "ChIJ2z-n_44LkEcRWdpWOIwcZ1Q",
  "plus_code": {
    "compound_code": "CG3R+CQ Zürich, Switzerland",
    "global_code": "8FVCCG3R+CQ"
  },
  "reference": "ChIJ2z-n_44LkEcRWdpWOIwcZ1Q",
  "scope": "GOOGLE",
  "types": [
    "doctor",
    "health",
    "point_of_interest",
    "establishment"
  ],
  "vicinity": "Ringstrasse 50, Zürich"
}
```
 
### Dev notes
You can clone actor and create your own build in Apify cloud with ENV.apiKey or ENV.APIKEY to exclude your Google API key from input (for example to provide support for doing secure runs from mobile or desktop apps).
