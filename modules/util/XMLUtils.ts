/**
 * XML utility functions to replace jQuery's XML parsing functionality.
 * This module provides native DOM API-based methods for XML manipulation.
 */

/**
 * Parses an XML string into a Document.
 * @param xmlString - The XML string to parse.
 * @returns Parsed XML Document or null if parsing fails.
 */
export function parseXML(xmlString: string): Document | null {
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
        console.error('XML parsing error:', parserError.textContent || '');
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

    // Check if element has querySelectorAll method
    if (typeof element.querySelectorAll !== 'function') {
        return [];
    }

    try {
        const nodeList = element.querySelectorAll(selector);
        const results = Array.from(nodeList);
        // Fallback for XML elements: if no results and selector is simple tag name,
        // try matching by localName to handle namespaced elements

        if (results.length === 0 && /^[a-zA-Z][\w-]*(\[.*\])?$/.test(selector)) {
            const children = element.children || [];

            return Array.from(children).filter((child: any) => {
                // Simple tag name match
                if (/^[a-zA-Z][\w-]*$/.test(selector)) {
                    return child.localName === selector || child.tagName === selector;
                }
                // Attribute selector match (basic support)
                const attrMatch = selector.match(/^([a-zA-Z][\w-]*)\[([^=]+)=["']?([^"'\]]+)["']?\]$/);

                if (attrMatch) {
                    const [ , tagName, attrName, attrValue ] = attrMatch;

                    return (child.localName === tagName || child.tagName === tagName)
                        && child.getAttribute(attrName) === attrValue;
                }

                return false;
            }) as Element[];
        }

        return results as Element[];
    } catch (error) {
        console.error('Invalid selector:', selector, error);

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
        console.error('Invalid selector:', selector, error);

        return false;
    }
}

/**
 * Iterates over all elements matching the selector and calls the callback for each.
 * @param element - The element or document to search within.
 * @param selector - CSS selector string.
 * @param callback - Function to call for each matching element.
 */
export function each(
        element: Element | Document,
        selector: string,
        callback: (index: number, element: Element) => void
): void {
    const elements = findAll(element, selector);

    elements.forEach((el, index) => callback(index, el));
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
        console.error('Invalid selector:', selector, error);

        return null;
    }
}
