import { findFirst, getAttribute } from './XMLUtils';

const ELEMENT = 'traceparent';
const NAMESPACE = 'jitsi:opentelemetry';
const TRACE_ID_ATTR_NAME = 'trace_id';
const PARENT_ID_ATTR_NAME = 'parent_id';
const TRACE_FLAGS_ATTR_NAME = 'trace_flags';

export class TraceParentExtension {
    traceId: string;
    parentId: string;
    traceFlags: string;

    readonly ELEMENT = ELEMENT;

    constructor(traceId: string, parentId: string, traceFlags: string) {
        this.traceId = traceId;
        this.parentId = parentId;
        this.traceFlags = traceFlags;
    }

    static fromElement(element: Element) {
        const traceParentExtension = findFirst(element, `:scope>${ELEMENT}[*|xmlns="${NAMESPACE}"]`);

        if (traceParentExtension == null) {
            return null;
        }

        const traceId = getAttribute(traceParentExtension, TRACE_ID_ATTR_NAME);
        if (traceId == null) {
            return null;
        }
        const parentId = getAttribute(traceParentExtension, PARENT_ID_ATTR_NAME);
        if (parentId == null) {
            return null;
        }
        const traceFlags = getAttribute(traceParentExtension, TRACE_FLAGS_ATTR_NAME);
        if (traceFlags == null) {
            return null;
        }

        return new TraceParentExtension(traceId, parentId, traceFlags);
    }

    asAttributes() {
        const attrs = {
            xmlns: NAMESPACE,
        };

        attrs[TRACE_ID_ATTR_NAME] = this.traceId;
        attrs[PARENT_ID_ATTR_NAME] = this.parentId;
        attrs[TRACE_FLAGS_ATTR_NAME] = this.traceFlags;

        return attrs;
    }
}
