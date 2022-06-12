## Features
Official Google Places API [Nearby search](https://developers.google.com/maps/documentation/places/web-service/search-nearby) can return as many as 60 results, split across three pages.
Actor override limit and getting all places in few kilometers radius around specified geopoint by doing distance search for all available categories.
This way its possible to get `96 categories * 60 results === up to 5760 results` with minimum amount of API calls and therefore minimal charges.
Categories copied from https://developers.google.com/maps/documentation/places/web-service/supported_types#table1 into code. Search is based on distance by category type, so if last place from API results is inside radius we call next page of results, otherwise saving all the results and continue till the the last category.
Approach expected to work for distances up to 3000 meters, duplicates are filtered out (for example same place might appear in both `bar` and `cafe` categories, it will be saved only once since returned place details are equal in both cases).

## External requirements
You need to obtain your own [Google API key](https://developers.google.com/maps/documentation/places/web-service/get-api-key)

## Cost of usage
- [Google rates](https://developers.google.com/maps/documentation/places/web-service/usage-and-billing#nearby-search) applied as usual: 32.00 USD per 1000 calls, so getting all places i.e. for 1km radius should be at max `96 categories * 3 pages = 288 calls` or $9.22
Its more efficient than doing many small searches from many locations nearby because in such case up to 25% of results are duplicates while amount of calls to get accurate results is around two times higher (for example over 500 calls to cover 1km radius). Therefore each run for 1km radius in populated area should save from $5 to $10 on Google API charges.

### Input example
For advanced usage there is internal support (not displayed in input form) for custom `categories` array and `maxResults` - use with care because actor will not validate values of custom categories and max results should be in values by 20 because each page of results from Google API always returns 20 results.
```jsonc
{
  "apiKey": "YOUR OWN GOOGLE API KEY",
  "latitude": "47.41168232410833",
  "longitude": "8.54417797274538",
  "radiusMeters": 1000,
  "maxResults": 60,
  "categories": [ "cafe", "bar" ],
  "debugLog": false
}
```

### Output example
Output saved exactly as it comes from Google API data feed.
```jsonc
{
  "business_status": "OPERATIONAL",
  "geometry": {
    "location": {
      "lat": 47.4113845,
      "lng": 8.543746100000002
    },
    "viewport": {
      "northeast": {
        "lat": 47.4126862302915,
        "lng": 8.545358530291505
      },
      "southwest": {
        "lat": 47.4099882697085,
        "lng": 8.5426605697085
      }
    }
  },
  "icon": "https://maps.gstatic.com/mapfiles/place_api/icons/v1/png_71/cafe-71.png",
  "icon_background_color": "#FF9E67",
  "icon_mask_base_uri": "https://maps.gstatic.com/mapfiles/place_api/icons/v2/cafe_pinlet",
  "name": "pao pao - modern tea - Bahnhof Oerlikon",
  "opening_hours": {
    "open_now": false
  },
  "photos": [
    {
      "height": 3456,
      "html_attributions": [
        "<a href=\"https://maps.google.com/maps/contrib/108434687165297760249\">Gamer Pro • 18 Years ago</a>"
      ],
      "photo_reference": "Aap_uECuJfQ9RVzpAFUS2V1zLw-DqxV9e6dnUWrP92ZLJd_51PZaq82ahC-DEhoEbbqmoSk7ofMIgyvnfs-ojQ4HF6tNRO7F9ydnrXYjBogAcpzI7dH1F5UsSO8y-6JjUtLrG-5D6Ycdcz5s2U8OAw4KyEqEJmCB3ytg-BTDl4MSSy_yXOOn",
      "width": 4608
    }
  ],
  "place_id": "ChIJlVTOFr0LkEcRLQAFsp-Cff4",
  "plus_code": {
    "compound_code": "CG6V+HF Zürich, Switzerland",
    "global_code": "8FVCCG6V+HF"
  },
  "rating": 4.9,
  "reference": "ChIJlVTOFr0LkEcRLQAFsp-Cff4",
  "scope": "GOOGLE",
  "types": [
    "cafe",
    "point_of_interest",
    "food",
    "establishment"
  ],
  "user_ratings_total": 491,
  "vicinity": "Hofwiesenstrasse 369 Bahnhof Oerlikon - Unterführung Mitte, Zürich"
}
```

### Dev notes
You can clone actor and create your own build in Apify cloud with ENV.apiKey or ENV.APIKEY to exclude your Google API key from input (for example to prvoide support for doing secure runs from mobile or desktop apps).
