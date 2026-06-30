import { findFirst, getAttribute } from './XMLUtils';

const ELEMENT = 'traceparent';
const NAMESPACE = 'opentelemetry';
const TRACE_ID_ATTR_NAME = 'trace_id';
const PARENT_ID_ATTR_NAME = 'parent_id';

export class TraceParentExtension {
    traceId: string;
    parentId: string;

    readonly ELEMENT = ELEMENT;

    constructor(traceId: string, parentId: string) {
        this.traceId = traceId;
        this.parentId = parentId;
    }

    static fromElement(element: Element) {
        const traceParentExtension = findFirst(element, `:scope ${ELEMENT}[*|xmlns="${NAMESPACE}"]`);

        if (traceParentExtension == null) {
            return null;
        }

        const traceId = getAttribute(traceParentExtension, TRACE_ID_ATTR_NAME);
        const parentId = getAttribute(traceParentExtension, PARENT_ID_ATTR_NAME);

        return new TraceParentExtension(traceId, parentId);
    }

    asAttributes() {
        const attrs = {
            xmlns: NAMESPACE,
        };

        attrs[TRACE_ID_ATTR_NAME] = this.traceId;
        attrs[PARENT_ID_ATTR_NAME] = this.parentId;

        return attrs;
    }
}
