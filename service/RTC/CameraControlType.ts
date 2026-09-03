/**
 * Enumeration of the camera pan/tilt/zoom controls. The values match the corresponding
 * MediaTrackConstraints/MediaTrackCapabilities/MediaTrackSettings member names defined by the
 * MediaCapture PTZ spec, so they can be used directly as constraint keys.
 */
export enum CameraControlType {
    PAN = 'pan',
    TILT = 'tilt',
    ZOOM = 'zoom'
}
