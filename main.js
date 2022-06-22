const Apify = require('apify');

const { createApiCallsByCategory, handleApiResults, savePlaceTypes, addGridPoints } = require('./src/grid-search');
const { initRootSquare, handleBBoxResults } = require('./src/bbox-search');

const { utils: { log } } = Apify;

Apify.main(async () => {
    const input = await Apify.getInput();
    // accept api keys from process.env for custom actor builds
    input.apiKey = input.apiKey || process.env.apiKey || process.env.APIKEY;
    // default proxy based on RESIDENTIAL group since it works the best to access Google API wo blocking
    input.proxy = input.proxy || { useApifyProxy: true };
    // default radius is 1000 meters
    input.radiusMeters = input.radiusMeters || 1000;
    // input.minRadiusMeters = input.minRadiusMeters || 50;

    const { apiKey, latitude, longitude, maxResults, minRadiusMeters, proxy, debugLog } = input;

    if (!(apiKey && latitude && longitude)) {
        log.info('REQUIRED apiKey, latitude, longitude', input);
        throw new Error('BROKEN-INPUT');
    }

    if (debugLog) {
        log.setLevel(log.LEVELS.DEBUG);
    }

    const state = await Apify.getValue('STATE') || {
        places: [], // saved places to checkup for duplicates
    };
    const persistState = async () => { await Apify.setValue('STATE', state); };
    Apify.events.on('persistState', persistState);

    let startSearch;
    // AB testing for grid or square search
    if (minRadiusMeters) {
        // based on grid with minRadiusMeters
        const searchPoints = await addGridPoints(input);
        if (searchPoints?.length) {
            const latitudeArray = searchPoints.map((x) => x[1]);
            const longitudeArray = searchPoints.map((x) => x[0]);
            log.debug(`latitude from ${Math.min(...latitudeArray)} to ${Math.max(...latitudeArray)}`);
            log.debug(`longitude from ${Math.min(...longitudeArray)} to ${Math.max(...longitudeArray)}`);
            // return;
        }
        startSearch = createApiCallsByCategory(searchPoints, input);
    } else {
        startSearch = await initRootSquare(input);
    }

    const requestList = await Apify.openRequestList('start-urls', startSearch);
    const requestQueue = await Apify.openRequestQueue();
    const proxyConfiguration = await Apify.createProxyConfiguration(proxy);

    const crawler = new Apify.CheerioCrawler({
        requestList,
        requestQueue,
        proxyConfiguration,
        // follow API rate limit (100 requests per second)
        maxConcurrency: 5,
        maxRequestRetries: 3,
        useSessionPool: true,
        maxRequestsPerCrawl: maxResults ? Math.floor(maxResults / 20) : undefined,
        handlePageFunction: async (context) => {
            if (context?.request?.userData?.bbox) {
                return handleBBoxResults(context, state, input);
            }
            return handleApiResults(context, state, input);
        },
    });

    await crawler.run();
    await savePlaceTypes(state);
    const placesInRadius = state.places.filter((x) => x.distanceMeters < input.radiusMeters);
    log.info(`Crawl finished with ${placesInRadius.length} places in radius out of ${state.places.length} unique places in total`);
});
