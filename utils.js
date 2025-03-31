/**
 * Helper function to check if a value is a valid number or coercible to one.
 * @param {*} value - The value to check.
 * @returns {boolean} - True if the value is a valid number or coercible to one, false otherwise.
 */
export function isValidNumber(value) {
    return !Number.isNaN(Number(value)) && value !== null && value !== '';
}