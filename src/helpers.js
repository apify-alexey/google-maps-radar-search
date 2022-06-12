const METERS_IN_A_LATITUDE_DEGREE = 111000;

function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

// get the meters between a longitude degree at a given latitude
function getMetersInLongitudeDegree(latitude) {
    return Math.cos((latitude * Math.PI) / 180) * METERS_IN_A_LATITUDE_DEGREE;
}

function getStep(searchRadiusInMeters, metersInDegree) {
    // a latitude step should be equal to the largest square that can be inscribed in the search circle (to easily ensure total
    // coverage of the search area).
    // so, we know that the square's diagonal is equal to the diameter of the circle
    // using the Pythagorean theorem, we know one of the sides of the square (and therfore the length
    // of the step) will be √(diameter^2 / 2)
    const diameterSquared = Math.pow(searchRadiusInMeters * 2, 2);
    return Math.sqrt(diameterSquared / 2) / metersInDegree;
}

function getGrid(latRange, longRange, searchRadiusInMeters) {
    const [minLat, maxLat] = latRange;
    const [minLong, maxLong] = longRange;
    const metersInLongitudeDegree = getMetersInLongitudeDegree(latRange[1]);

    const latStep = getStep(searchRadiusInMeters, METERS_IN_A_LATITUDE_DEGREE);
    const longStep = getStep(searchRadiusInMeters, metersInLongitudeDegree);

    const latSteps = [];
    const longSteps = [];

    let currentLong = minLong;
    while (currentLong <= maxLong + longStep) {
        longSteps.push(currentLong);
        currentLong += longStep;
    }

    let currentLat = minLat;
    while (currentLat <= maxLat + latStep) {
        latSteps.push(currentLat);
        currentLat += latStep;
    }

    return {
        steps: longSteps
            .map((longStep) => {
                return latSteps.map((latStep) => [round(latStep), round(longStep)]);
            })
            .flat(),
        latStep,
        longStep,
    };
}

function round(num) {
    return Math.round(num * 10000) / 10000;
}

module.exports = {
    round,
    getGrid,
    sleep,
};
