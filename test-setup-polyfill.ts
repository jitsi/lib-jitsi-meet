/**
 * Test setup file that makes the browser's DOM look like the one lib-jitsi-meet gets on React Native, where
 * jitsi-meet runs strophe on top of @xmldom/xmldom (react/features/mobile/polyfills/browser.js) rather than a
 * browser DOM:
 *
 * - querySelector/querySelectorAll are replaced with the polyfill from @jitsi/js-utils, which is what the
 *   mobile app installs.
 * - The element-traversal accessors which xmldom does not implement (firstElementChild, lastElementChild,
 *   childElementCount, nextElementSibling, previousElementSibling) are removed, so that code which relies on
 *   them fails here the same way it fails on a device. xmldom does provide firstChild, lastChild, childNodes,
 *   and the mobile app polyfills `children`, so those stay.
 *
 * This file is loaded by karma-polyfill.conf.js BEFORE any test specs, ensuring all tests run in this mode.
 */

import { querySelector, querySelectorAll } from '@jitsi/js-utils/polyfills';

/**
 * Element APIs which @xmldom/xmldom (0.8.x, as used by jitsi-meet on React Native) does not implement and the
 * mobile app does not polyfill. Code in lib-jitsi-meet must not rely on them.
 */
const ACCESSORS_MISSING_ON_REACT_NATIVE = [
    'childElementCount',
    'firstElementChild',
    'lastElementChild',
    'nextElementSibling',
    'previousElementSibling'
];

for (const name of ACCESSORS_MISSING_ON_REACT_NATIVE) {
    for (const proto of [ Element.prototype, Document.prototype, DocumentFragment.prototype ]) {
        if (Object.prototype.hasOwnProperty.call(proto, name)) {
            delete (proto as any)[name];
        }
    }
}

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
console.log('📱 React Native DOM simulation mode is ACTIVE');
console.log('   querySelector/querySelectorAll use the polyfill implementation from @jitsi/js-utils, and '
    + `${ACCESSORS_MISSING_ON_REACT_NATIVE.join(', ')} are unavailable`);
