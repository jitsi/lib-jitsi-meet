import { getLogger } from '@jitsi/logger';

const logger = getLogger('util:XMLUtils');

/**
 * Parses an XML string into a Document.
 * @param xmlString - The XML string to parse.
 * @returns Parsed XML Document or null if parsing fails.
 */
export function parseXML(xmlString: string): Nullable<Document> {
    if (!xmlString || typeof xmlString !== 'string') {
        return null;
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlString, 'text/xml');

    // Check for parser errors - use documentElement since
    // Document.querySelector might not be polyfilled in React Native
    const parserError = doc.documentElement
        ? findFirst(doc.documentElement, 'parsererror')
        : null;

    if (parserError) {
        logger.error('XML parsing error:', parserError.textContent || '');
        // Return the document anyway for compatibility
        // jQuery also returns a document with parser errors
    }

    return doc;
}

/**
 * Finds all elements matching the CSS selector within the given element.
 * @param element - The element or document to search within.
 * @param selector - CSS selector string.
 * @returns Array of matching elements.
 */
export function findAll(element: Element | Document, selector: string): Element[] {
    if (!element) {
        return [];
    }

    try {
        return Array.from(element.querySelectorAll(selector));
    } catch (error) {
        logger.error('Query error:', selector, error);

        return [];
    }
}

/**
 * Gets the value of an attribute from an element.
 * @param element - The element to get the attribute from.
 * @param name - The attribute name.
 * @returns The attribute value or null if not found.
 */
export function getAttribute(element: Element | null, name: string): string | null {
    if (!element || !name) {
        return null;
    }

    return element.getAttribute(name);
}

/**
 * Sets an attribute on an element.
 * @param element - The element to set the attribute on.
 * @param name - The attribute name.
 * @param value - The attribute value.
 */
export function setAttribute(element: Element | null, name: string, value: string): void {
    if (!element || !name) {
        return;
    }

    element.setAttribute(name, value);
}

/**
 * Gets the text content of an element.
 * @param element - The element to get text from.
 * @returns The text content or empty string if element is null.
 */
export function getText(element: Element | null): string {
    if (!element) {
        return '';
    }

    return element.textContent || '';
}

/**
 * Sets the text content of an element.
 * @param element - The element to set text on.
 * @param text - The text content to set.
 */
export function setText(element: Element | null, text: string): void {
    if (!element) {
        return;
    }

    element.textContent = text;
}

/**
 * Gets the child elements of an element (excluding text nodes).
 * @param element - The parent element.
 * @returns Array of child elements.
 */
export function getChildren(element: Element): Element[] {
    if (!element) {
        return [];
    }

    return Array.from(element.children);
}

/**
 * Checks if any elements match the selector within the given element.
 * @param element - The element or document to search within.
 * @param selector - CSS selector string.
 * @returns True if at least one element matches the selector.
 */
export function exists(element: Element | Document, selector: string): boolean {
    if (!element) {
        return false;
    }

    try {
        return element.querySelector(selector) !== null;
    } catch (error) {
        logger.error('Query error:', selector, error);

        return false;
    }
}

/**
 * Gets the first element matching the selector, or null if none found.
 * This is a convenience function equivalent to findAll(...)[0] || null.
 * @param element - The element or document to search within.
 * @param selector - CSS selector string.
 * @returns The first matching element or null.
 */
export function findFirst(element: Element | Document, selector: string): Element | null {
    if (!element) {
        return null;
    }

    try {
        return element.querySelector(selector);
    } catch (error) {
        logger.error('Query error:', selector, error);

        return null;
    }
}
