/**
 * Enumeration of the scalability modes supported by the video encoders.
 * For more information, check https://www.w3.org/TR/webrtc-svc/#dependencydiagrams*
 *
 * enum VideoEncoderScalabilityMode {
 *  L1T3: string;
 *  L2T3: string;
 *  L2T3_KEY: string;
 *  L3T3: string;
 *  L3T3_KEY: string;
 * }
 */
export enum VideoEncoderScalabilityMode {
    /**
     * L1T3 mode: 1-layer spatial and 3-layer temporal scalabilty encoding.
     */
    L1T3 = 'L1T3',

    /**
     * L2T2 mode: 2-layer spatial and 3-layer temporal scalability encoding.
     */
    L2T3 = 'L2T3',

    /**
     * L2T3_KEY mode: 2-layer spatial and 3-layer temporal scalability K-SVC encoding.
     */
    L2T3_KEY = 'L2T3_KEY',

    /**
     * L3T3 mode: -layer spatial and 3-layer temporal scalability encoding.
     */
    L3T3 = 'L3T3',

    /**
     * L3T3_Key mode: 3-layer spatial and 3-layer temporal scalability K-SVC encoding.
     */
    L3T3_KEY = 'L3T3_KEY'
}
