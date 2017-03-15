/**
 * Gets object's values.
 * @param {Object} object
 * @return {Array<Object>}
 */
export function getValues(object) {
    return Object.keys(object).map(key => object[key]);
}
