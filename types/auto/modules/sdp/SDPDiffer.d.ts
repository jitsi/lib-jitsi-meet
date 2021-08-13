/**
 *
 * @param mySDP
 * @param otherSDP
 */
export default function SDPDiffer(mySDP: any, otherSDP: any): void;
export default class SDPDiffer {
    /**
     *
     * @param mySDP
     * @param otherSDP
     */
    constructor(mySDP: any, otherSDP: any);
    mySDP: any;
    otherSDP: any;
    /**
     * Returns map of MediaChannel that contains media contained in
     * 'mySDP', but not contained in 'otherSdp'. Mapped by channel idx.
     */
    getNewMedia(): {};
    /**
     * TODO: document!
     */
    toJingle(modify: any): boolean;
}
