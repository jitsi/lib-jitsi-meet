/**
 * Higher-order function that checks whether an array includes a value.
 * @param array the haystack
 * @returns {(value:any) => boolean} the needle-searching function
 */
export const includes = array => value => array.includes(value);

/**
 * Higher-order function that checks whether an array omits a value.
 * @param array the haystack
 * @returns {(value:any) => boolean} the needle-searching function
 */
export const omits = array => value => !includes(array)(value);
