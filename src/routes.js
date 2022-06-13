const Apify = require('apify');
const turf = require('@turf/turf');

const { placeTypes, msDelayForApiCalls } = require('./consts');

const { utils: { log, sleep } } = Apify;

// Official API client removed and better to be avoided since poorly documented and not flexible
// https://github.com/googlemaps/google-maps-services-js
// const { Client } = require('@googlemaps/google-maps-services-js');
// const client = new Client({});
exports.getPlacesFromApiClient = async (points, input) => {
    return { points, input };
};

exports.addGridPoints = ({ latitude, longitude, radiusMeters, minRadiusMeters }) => {
    const cellSide = (minRadiusMeters * 2) / 1000;
    const fromPoint = turf.point([latitude, longitude]);
    const maxDistanceKm = Math.sqrt(2 * (radiusMeters - minRadiusMeters) ** 2) / 1000;
    const topLeft = turf.destination(fromPoint, maxDistanceKm, 180 + 45);
    const bottomRight = turf.destination(fromPoint, maxDistanceKm, 45);
    const bbox = [...topLeft.geometry.coordinates, ...bottomRight.geometry.coordinates];
    const grid = turf.pointGrid(bbox, cellSide);
    const circlePoints = grid.features.flatMap((point) => {
        const distanceMeters = Math.floor(turf.distance(fromPoint, point) * 1000);
        if (distanceMeters < radiusMeters) {
            return [point.geometry.coordinates];
        }
        return [];
    });

    log.info(`Grid size ${grid.features.length} reduced to ${circlePoints.length} points in radius`, circlePoints[0]);
    return circlePoints;
};

// create nearbysearch calls per category rankby distance
exports.createApiCallsByCategory = (points, { apiKey, latitude, longitude, radiusMeters, categories, minRadiusMeters, useOfficialApiTypes }) => {
    const apiRequests = [];
    // if input.categories array not specified use official Api Types or *
    // type=* should be used instead keyword=* since * as keyword or name is deprecated and will be shut down by March 2023
    let addCategories = useOfficialApiTypes ? placeTypes : ['*'];
    if (categories?.length) {
        addCategories = categories;
    }
    const baseUrl = 'https://maps.googleapis.com/maps/api/place/nearbysearch/json';
    log.info(`Getting places in ${radiusMeters} meters around coordinates ${latitude}, ${longitude}`);
    for (const category of addCategories) {
        for (const point of points) {
            const baseApi = `${baseUrl}?&location=${point[0]}%2C${point[1]}&rankby=distance&key=${apiKey}`;
            apiRequests.push({
                url: `${baseApi}&type=${category}`,
                userData: {
                    category,
                    latitude,
                    longitude,
                    radiusMeters: minRadiusMeters,
                    minRadiusMeters,
                    counter: 1,
                },
            });
        }
    }
    return apiRequests;
};

// if we reach max API results for given center and radius, re-add 8 searches around request coordinates
const addSearchesAroundCirclePoints = async (request, requestQueue) => {
    const { url, userData } = request;
    const { radiusMeters } = userData;
    const newSearchRadiusMeters = radiusMeters / 2;
    const fromURL = new URL(url);
    fromURL.searchParams.set('pagetoken', '');
    const location = fromURL.searchParams.get('location').split(',');
    const searchPoint = turf.point([location[0], location[1]]);
    // lets say we hit limit at 200m in 1000m radius, re-add 8 search points around
    // center of uncovered area: 200 + ((1000 - 200) / 2) === 600m
    /* patterns
    O O O
    O . O
    O O O
    then if max not reached
    o o o
    o O o
    o o o
    and so on
    */
    for (let bearing = 0; bearing < 360; bearing += 45) {
        const newDestination = turf.destination(searchPoint, newSearchRadiusMeters / 1000, bearing);
        const coords = newDestination.geometry?.coordinates;
        fromURL.searchParams.set('location', coords.join());
        await requestQueue.addRequest({
            url: fromURL.toString(),
            userData: {
                ...userData,
                counter: 1,
                radiusMeters: newSearchRadiusMeters,
            },
        });
    }
};

// process results from nearbysearch
exports.handleApiResults = async ({ request, json, crawler }, { places }) => {
    const { url, userData } = request;
    const { category, latitude, longitude, radiusMeters, minRadiusMeters, counter } = userData;
    if (!(json && latitude && longitude && radiusMeters)) {
        log.error(`Invalid request ${url}`, userData);
        throw new Error('INVALID-REQUEST');
    }

    await sleep(msDelayForApiCalls);

    if (!json?.results?.length) {
        if (json?.status === 'ZERO_RESULTS') {
            log.info(`[CATEGORY]: zero results for ${category}`);
        } else {
            log.error(`[BAD-REQUEST]: ${url}`, json);
            throw new Error('BAD-REQUEST');
        }
        return;
    }

    const fromURL = new URL(url);
    const location = fromURL.searchParams.get('location');
    const locationFrom = location.split(',');
    const coordsFrom = turf.point([locationFrom[0], locationFrom[1]]);
    // add calculated radius from search coordinates (for subsearches its different from central point)
    const results = json.results.map((place) => {
        const placeLocation = place.geometry.location;
        const coordsTo = turf.point([placeLocation.lat, placeLocation.lng]);
        return {
            coordsTo,
            distanceMeters: Math.floor(turf.distance(coordsFrom, coordsTo) * 1000),
            ...place,
        };
    });

    const centralPoint = turf.point([latitude, longitude]);
    // save unique results to dataset
    const saveNewPlaces = [];
    for (const place of results) {
        const checkPlace = places.find((x) => x.place_id === place.place_id);
        if (!checkPlace) {
            // on save recalculate location from central point
            const placeObject = {
                ...place,
                distanceMeters: Math.floor(turf.distance(centralPoint, place.coordsTo) * 1000),
                coordsTo: undefined,
            };
            places.push(placeObject);
            saveNewPlaces.push(placeObject);
        } else {
            log.debug(`Skipped existing place ${place.place_id}`);
        }
    }
    if (saveNewPlaces?.length) {
        await Apify.pushData(saveNewPlaces);
    }

    const checkDistance = Math.floor(turf.distance(coordsFrom, centralPoint) * 1000);
    log.debug(`Search for ${category} at location ${location} ${checkDistance} meters from center`);

    const lastPlace = results[results.length - 1];
    const { distanceMeters } = lastPlace;
    if (distanceMeters <= radiusMeters && json?.next_page_token) {
        // if radius not reached continue to next page of results
        log.debug(`Next page for category ${category} at ${location}`);
        const nextUrl = new URL(url);
        nextUrl.searchParams.set('pagetoken', json.next_page_token);
        await crawler.requestQueue.addRequest({
            url: nextUrl.toString(),
            userData: {
                ...userData,
                counter: counter + 1,
            },
        });
    } else if (!json?.next_page_token && counter >= 3 && distanceMeters <= radiusMeters) {
        // if max results reached after known official limit it means we need to add more circles
        // to search around original location
        if (radiusMeters >= minRadiusMeters) {
            // add subsearches once
            await addSearchesAroundCirclePoints(request, crawler.requestQueue);
            log.info(`[API-LIMIT]: ${category} reached ${counter * 20} results at ${location}, ${distanceMeters} (out of ${radiusMeters}) meters`);
        } else {
            log.warning(`[MAX-LIMIT]: ${category} can not continue at ${location}, ${distanceMeters} (out of ${radiusMeters}) meters`);
        }
    } else {
        // otherwise either radius reached or there is no more places regardless distance (i.e. 1 casino in area)
        log.info(`[CATEGORY]: ${category} reached end at ${location} in ${distanceMeters} (out of ${radiusMeters}) meters`);
    }
};

exports.savePlaceTypes = async ({ places }) => {
    const uncategorizedPlaces = places.filter((x) => !x?.types?.length);
    const unofficialTypes = [];
    const placeDataTypes = [];
    for (const place of places) {
        const types = place?.types || [];
        for (const placeType of types) {
            placeDataTypes.push(placeType);
            if (!placeTypes.includes(placeType) && !unofficialTypes.includes(placeType)) {
                unofficialTypes.push(placeType);
            }
        }
    }
    if (placeDataTypes?.length) {
        const uniqueTypes = new Set(placeDataTypes);
        await Apify.setValue('placeDataTypes', [...uniqueTypes]);
        log.debug(`Found ${uncategorizedPlaces.length} uncategorized places and ${unofficialTypes.length} unofficial types`);
        if (unofficialTypes?.length) {
            await Apify.setValue('typesDiscovered', unofficialTypes);
        }
    }
};
