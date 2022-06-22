const Apify = require('apify');
const turf = require('@turf/turf');

const { msDelayForApiCalls, geoCoordinates, baseUrl } = require('./consts');

const { utils: { log, sleep } } = Apify;

// initial bounding box from radius, after that all subsearches done by splitting bbox based on first page of results
// this way we improve accuracy since bbox IS NOT square, we can not get rid of initial setting in meters
// but to do accurate subsearches we need to split area relative to parent coordinates, not to parent meters
const initRootSquare = async ({ latitude, longitude, radiusMeters, apiKey }) => {
    const fromPoint = turf.point(geoCoordinates({ latitude, longitude }));
    const maxDistanceKm = radiusMeters / 1000;
    const buffered = turf.buffer(fromPoint, maxDistanceKm);
    const bbox = turf.bbox(buffered);
    await Apify.setValue('bboxObject', bbox);
    log.debug(`longitude ${longitude} ${(bbox[2] + bbox[0]) / 2}`);
    log.debug(`latitude ${latitude} ${(bbox[3] + bbox[1]) / 2}`);
    return [{
        url: `${baseUrl}?&location=${latitude}%2C${longitude}&rankby=distance&key=${apiKey}&type=*`,
        userData: {
            category: '*', // wildcard search enforced
            latitude,
            longitude,
            latitudeCenter: latitude,
            longitudeCenter: longitude,
            radiusMeters,
            bbox,
            counter: 0,
        },
    }];
};

const handleBBoxResults = async ({ request, json, crawler }, { places }) => {
    const { url, userData } = request;
    const { category, latitude, longitude, bbox, counter, latitudeCenter, longitudeCenter } = userData;

    if (!json?.results?.length) {
        if (json?.status === 'ZERO_RESULTS') {
            log.info(`[CATEGORY]: zero results for ${category}`);
        } else {
            log.error(`[BAD-REQUEST]: ${url}`, json);
            throw new Error('BAD-REQUEST');
        }
        return;
    }

    await sleep(msDelayForApiCalls);

    const coordsFromCenter = turf.point(geoCoordinates({ latitude: latitudeCenter, longitude: longitudeCenter }));
    // add calculated radius from search coordinates
    const results = json.results.map((place) => {
        const placeLocation = place.geometry.location;
        const coordsTo = turf.point(geoCoordinates({ latitude: placeLocation.lat, longitude: placeLocation.lng }));
        return {
            distanceMeters: Math.floor(turf.distance(coordsFromCenter, coordsTo) * 1000),
            ...place,
        };
    });

    // save unique results to dataset
    const saveNewPlaces = [];
    for (const place of results) {
        const checkPlace = places.find((x) => x.place_id === place.place_id);
        if (!checkPlace) {
            places.push(place);
            saveNewPlaces.push(place);
        }
    }
    if (saveNewPlaces?.length) {
        await Apify.pushData(saveNewPlaces);
    }

    const bboxPolygon = turf.bboxPolygon(bbox);
    const coordsFrom = turf.point(geoCoordinates({ latitude, longitude }));

    // checkup for logic errors (never expected)
    // !json?.next_page_token it means no places in 50km, so if we getting such results then logic is broken somehow
    // !turf.booleanPointInPolygon(coordsFrom, bboxPolygon) means search call logically incorrect
    if (!json?.next_page_token || !turf.booleanPointInPolygon(coordsFrom, bboxPolygon)) {
        log.error(`[CORRUPTED-DATA] at ${url}`, userData);
        return;
    }

    const reachedPlace = results[results.length - 1];
    const reachedCoords = reachedPlace.geometry.location; // { lat, lng }
    const coordsPoint = turf.point(geoCoordinates({ latitude: reachedCoords.lat, longitude: reachedCoords.lng }));

    const isInside = turf.booleanPointInPolygon(coordsPoint, bboxPolygon);
    if (!isInside) {
        log.info(`[CATEGORY]: ${category}${counter} done at ${latitude},${longitude} ${reachedPlace.distanceMeters}m away`);
        return;
    }

    const fromURL = new URL(url);

    // if we not get full results from call then split bbox by 2 and search again (4 boxes)
    // this way crawler will follow heatmap alike pattern doing search from biggest (root) possible area
    // going down to smaller areas

    // https://turfjs.org/docs/#bbox
    // bbox extent in minX, minY, maxX, maxY order

    const longitudeMin = bbox[0];
    const latitudeMin = bbox[1];
    const longitudeMax = bbox[2];
    const latitudeMax = bbox[3];

    const addBoxes = [
        [longitudeMin, latitudeMin, longitude, latitude],
        [longitude, latitudeMin, longitudeMax, latitude],
        [longitude, latitude, longitudeMax, latitudeMax],
        [longitudeMin, latitude, longitude, latitudeMax],
    ];

    for (const box of addBoxes) {
        const bPolygon = turf.bboxPolygon(box);
        const center = turf.center(bPolygon);
        const newCoords = center.geometry.coordinates;
        fromURL.searchParams.set('location', `${newCoords[1]},${newCoords[0]}`);
        await crawler.requestQueue.addRequest({
            url: fromURL.toString(),
            userData: {
                ...userData,
                latitude: newCoords[1],
                longitude: newCoords[0],
                bbox: box,
                counter: counter + 1,
            },
        });
    }
};

module.exports = {
    initRootSquare,
    handleBBoxResults,
};
