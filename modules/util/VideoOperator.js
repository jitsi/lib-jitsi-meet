/* jshint -W101 */

/**
 * @const
 */
var DEFAULT_FPS = 30;

/**
 * @const
 */
var DEFAULT_MIME = 'image/png';

/**
 * Create new Camera.
 * It allows to capture frames from video element.
 * @param {HTMLVideoElement} video source video element
 * @constructor
 */
var Camera = function (video) {
    this.video = video;
    this.frames = [];
};

/**
 * Get camera id (video element id).
 * @returns {string} id
 */
Camera.prototype.getId = function () {
    return this.video.id;
};

/**
 * Start capturing video frames.
 * @param {number} [fps=DEFAULT_FPS] custom fps
 */
Camera.prototype.start = function (fps) {
    this.canvas = document.createElement('canvas');
    this.canvas.style.display = 'none';
    document.body.appendChild(this.canvas);

    var width = this.video.videoWidth;
    var height = this.video.videoHeight;

    this.canvas.width = width;
    this.canvas.height = height;

    var context = this.canvas.getContext('2d');

    this.startTime = Date.now();
    this.interval = window.setInterval(function () {
        context.drawImage(this.video, 0, 0);
        this.frames.push(context.getImageData(0, 0, width, height));
    }.bind(this), Math.floor(1000 / (fps || DEFAULT_FPS)));
};

/**
 * Stop capturing video frames.
 */
Camera.prototype.stop = function () {
    window.clearInterval(this.interval);
    this.endTime = Date.now();
};

/**
 * Get number of captured frames.
 * @returns {number}
 */
Camera.prototype.getFramesCount = function () {
    return this.frames.length;
};

/**
 * Get frame image as base64 string.
 * @param {number} pos frame position
 * @param {string} [mimeType=DEFAULT_MIME] image mime type
 * @returns {string} image as base64 string
 */
Camera.prototype.getFrame = function (pos, mimeType) {
    var imageData = this.frames[pos];
    if (!imageData) {
        throw new Error(
            "cannot find frame " + pos + " for video " + this.getId()
        );
    }
    this.canvas.getContext('2d').putImageData(imageData, 0, 0);

    var prefix = 'data:' + mimeType + ';base64,';

    return this.canvas.toDataURL(
        mimeType || DEFAULT_MIME
    ).substring(prefix.length);
};

/**
 * Calculate real fps (may differ from expected one).
 * @returns {number} fps
 */
Camera.prototype.getRealFPS = function () {
    return this.frames.length * 1000 / (this.endTime - this.startTime);
};

/**
 * Calculate size of captured video frames.
 * @returns {number} size of captured frames (in bytes).
 */
Camera.prototype.getRawDataSize = function () {
    return this.frames.reduce(function (acc, imageData) {
        return acc + imageData.data.length;
    }, 0);
};

/**
 * Cleanup.
 */
Camera.prototype.cleanup = function () {
    document.body.removeChild(this.canvas);
};



/**
 * Video operator.
 * Manages Cameras.
 */
var VideoOperator = function () {
    this.cameras = [];
};

/**
 * Use Cameras to capture frames from all video elements.
 * @param {string[]} videoIds array if ids of target video elements.
 * @param {number} [fps=DEFAULT_FPS] fps for cameras
 */
VideoOperator.prototype.recordAll = function (videoIds, fps) {
    videoIds.forEach(function (videoId) {
        var element = document.getElementById(videoId);
        if (!element) {
            throw new Error("cannot find element with id " + videoId);
        }

        var recorder = new Camera(element);
        recorder.start(fps);

        this.cameras.push(recorder);
    }.bind(this));
};

/**
 * Stop all Cameras.
 */
VideoOperator.prototype.stop = function () {
    this.cameras.forEach(function (camera) {
        camera.stop();
    });
};

/**
 * Calculate real fps.
 * @returns {number} fps
 */
VideoOperator.prototype.getRealFPS = function () {
    return this.cameras.reduce(function (acc, camera) {
        return acc + camera.getRealFPS();
    }, 0) / this.cameras.length;
};

/**
 * Calculate size of captured video frames.
 * @returns {number} size of captured frames (in bytes).
 */
VideoOperator.prototype.getRawDataSize = function () {
    return this.cameras.reduce(function (acc, camera) {
        return acc + camera.getRawDataSize();
    }, 0) / this.cameras.length;
};

/**
 * Find Camera by id or throw an error.
 * @param {string} videoId
 * @returns {Camera}
 */
VideoOperator.prototype.getCamera = function (videoId) {
    for (var i = 0; i < this.cameras.length; i += 1) {
        if (this.cameras[i].getId() === videoId) {
            return this.cameras[i];
        }
    }

    throw new Error("cannot find camera with id " + videoId);
};

/**
 * Get number of frames captured by the Camera with specified id.
 * @param {string} videoId id of the camera
 * @returns {number} number of frames
 */
VideoOperator.prototype.getFramesCount = function (videoId) {
    return this.getCamera(videoId).getFramesCount();
};

/**
 * Get frame image as base64 string.
 * @param {string} videoId id of the camera
 * @param {number} pos frame position
 * @param {string} [mimeType=DEFAULT_MIME] image mime type
 * @returns {string} image as base64 string
 */
VideoOperator.prototype.getFrame = function (videoId, pos, mimeType) {
    return this.getCamera(videoId).getFrame(pos, mimeType);
};

/**
 * Cleanup.
 */
VideoOperator.prototype.cleanup = function () {
    this.cameras.forEach(function (camera) {
        camera.cleanup();
    });
};

module.exports = VideoOperator;
