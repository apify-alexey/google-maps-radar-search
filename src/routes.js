const Apify = require('apify');
const turf = require('@turf/turf');

const { placeTypes, msDelayForApiCalls } = require('./consts');

const { utils: { log, sleep } } = Apify;

// create nearbysearch calls per category rankby distance
exports.createApiCallsByCategory = ({ apiKey, latitude, longitude, radiusMeters, categories }) => {
    const apiRequests = [];
    const baseApi = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?&location=${latitude}%2C${longitude}&rankby=distance&key=${apiKey}`;
    // if input.categories array not specified use all possible placeTypes
    const addCategories = categories?.length ? categories : placeTypes;
    for (const category of addCategories) {
        apiRequests.push({
            url: `${baseApi}&type=${category}`,
            userData: {
                category,
                latitude,
                longitude,
                radiusMeters,
            },
        });
    }
    return apiRequests;
};

// process results from nearbysearch
exports.handleApiResults = async ({ request, json, crawler }, { places, finishedCategory }) => {
    const { url, userData } = request;
    const { category, latitude, longitude, radiusMeters } = userData;
    if (!(json && latitude && longitude && radiusMeters)) {
        log.error(`Invalid request ${url}`, userData);
        throw new Error('INVALID-REQUEST');
    }

    await sleep(msDelayForApiCalls);

    if (!json?.results?.length) {
        log.error(`NO-PLACES from ${url}`);
        return;
    }

    // save unique results to dataset
    const saveNewPlaces = [];
    for (const place of json.results) {
        const checkPlace = places.find((x) => x.place_id === place.place_id);
        if (!checkPlace) {
            places.push(place);
            saveNewPlaces.push(place);
        } else {
            log.debug(`Skipped existing place ${place.place_id}`);
        }
    }
    if (saveNewPlaces?.length) {
        await Apify.pushData(saveNewPlaces);
    }

    const lastPlaceLocation = json.results[json.results.length - 1].geometry.location;
    const coordsFrom = turf.point([latitude, longitude]);
    const coordsTo = turf.point([lastPlaceLocation.lat, lastPlaceLocation.lng]);
    const distanceMeters = turf.distance(coordsFrom, coordsTo) * 1000;
    if (distanceMeters < radiusMeters) {
        // if radius not reached continue to next page of results
        if (json?.next_page_token) {
            log.debug(`Next page for category ${category}`);
            const nextUrl = new URL(url);
            nextUrl.searchParams.set('pagetoken', json.next_page_token);
            await crawler.requestQueue.addRequest({
                url: nextUrl.toString(),
                userData,
            });
        } else {
            log.warning(`[CATEGORY]: ${category} have more than 60 results`);
        }
    } else {
        log.info(`[CATEGORY]: ${category} - reached end of results at ${distanceMeters} meters`);
        finishedCategory.push(category);
    }
};
