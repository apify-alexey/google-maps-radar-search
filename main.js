const Apify = require('apify');

const { createApiCallsByCategory, handleApiResults, savePlaceTypes, addGridPoints } = require('./src/routes');

const { utils: { log } } = Apify;

Apify.main(async () => {
    const input = await Apify.getInput();
    // accept api keys from process.env for custom actor builds
    input.apiKey = input.apiKey || process.env.apiKey || process.env.APIKEY;
    // default radius is 1000 meters
    input.radiusMeters = input.radiusMeters || 1000;
    input.minRadiusMeters = input.minRadiusMeters || 50;

    const { apiKey, latitude, longitude, maxResults, proxy, debugLog } = input;

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

    const searchPoints = addGridPoints(input);

    const requestList = await Apify.openRequestList('start-urls', createApiCallsByCategory(searchPoints, input));
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
            return handleApiResults(context, state);
        },
    });

    await crawler.run();
    await savePlaceTypes(state);
    const placesInRadius = state.places.filter((x) => x.distanceMeters < input.radiusMeters);
    log.info(`Crawl finished with ${placesInRadius.length} places in radius out of ${state.places.length} unique places in total`);
});
