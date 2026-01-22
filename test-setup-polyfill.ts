/**
 * Test setup file that overrides native querySelector/querySelectorAll implementations
 * with the polyfill from @jitsi/js-utils. This simulates a React Native environment
 * where native querySelector is not available.
 *
 * This file is loaded by karma-polyfill.conf.js BEFORE any test specs, ensuring all
 * tests run with the polyfill active.
 */

import { querySelector, querySelectorAll } from '@jitsi/js-utils/polyfills';

/**
 * Override Element.prototype methods with polyfill implementations.
 */
Element.prototype.querySelector = function(selectors: string): Element | null {
    return querySelector(this, selectors);
};

Element.prototype.querySelectorAll = function(selectors: string): NodeListOf<Element> {
    const results = querySelectorAll(this, selectors);

    // Convert array to NodeListOf<Element> for API compatibility.
    return results as unknown as NodeListOf<Element>;
};

/**
 * Override Document.prototype methods with polyfill implementations.
 */
Document.prototype.querySelector = function(selectors: string): Element | null {
    return querySelector(this, selectors);
};

Document.prototype.querySelectorAll = function(selectors: string): NodeListOf<Element> {
    const results = querySelectorAll(this, selectors);

    return results as unknown as NodeListOf<Element>;
};

// Log confirmation that polyfill is active.
console.log('📱 querySelector/querySelectorAll polyfill is ACTIVE (React Native simulation mode)');
console.log('   All tests will use the polyfill implementation from @jitsi/js-utils');
