import { safeJsonParse } from '@jitsi/js-utils/json';
import { getLogger } from '@jitsi/logger';
import $ from 'jquery';
import { $build } from 'strophe.js';

import { MediaType } from '../../service/RTC/MediaType';
import { SSRC_GROUP_SEMANTICS } from '../../service/RTC/StandardVideoQualitySettings';
import { VideoType } from '../../service/RTC/VideoType';
import { XEP } from '../../service/xmpp/XMPPExtensioProtocols';

const logger = getLogger(__filename);

/**
 * Creates a "source" XML element for the source described in compact JSON format in [sourceCompactJson].
 * @param {*} owner the endpoint ID of the owner of the source.
 * @param {*} sourceCompactJson the compact JSON representation of the source.
 * @param {boolean} isVideo whether the source is a video source
 * @returns the created "source" XML element.
 */
function _createSourceExtension(owner, sourceCompactJson, isVideo = false) {
    let videoType = sourceCompactJson.v ? VideoType.DESKTOP : undefined;

    // If the video type is not specified, it is assumed to be a camera for video sources.
    // Jicofo adds the video type only for desktop sharing sources.
    if (!videoType && isVideo) {
        videoType = VideoType.CAMERA;
    }

    const node = $build('source', {
        xmlns: XEP.SOURCE_ATTRIBUTES,
        ssrc: sourceCompactJson.s,
        name: sourceCompactJson.n,
        videoType
    });

    if (sourceCompactJson.m) {
        node.c('parameter', {
            name: 'msid',
            value: sourceCompactJson.m
        }).up();
    }
    node.c('ssrc-info', {
        xmlns: 'http://jitsi.org/jitmeet',
        owner
    }).up();

    return node.node;
}

/**
 * Creates an "ssrc-group" XML element for the SSRC group described in compact JSON format in [ssrcGroupCompactJson].
 * @param {*} ssrcGroupCompactJson the compact JSON representation of the SSRC group.
 * @returns the created "ssrc-group" element.
 */
function _createSsrcGroupExtension(ssrcGroupCompactJson) {
    const node = $build('ssrc-group', {
        xmlns: XEP.SOURCE_ATTRIBUTES,
        semantics: _getSemantics(ssrcGroupCompactJson[0])
    });

    for (let i = 1; i < ssrcGroupCompactJson.length; i++) {
        node.c('source', {
            xmlns: XEP.SOURCE_ATTRIBUTES,
            ssrc: ssrcGroupCompactJson[i]
        }).up();
    }

    return node.node;
}

/**
 * Finds in a Jingle IQ the RTP description element with the given media type. If one does not exists, create it (as
 *  well as the required  "content" parent element) and adds it to the IQ.
 * @param {*} iq
 * @param {*} mediaType The media type, "audio" or "video".
 * @returns the RTP description element with the given media type.
 */
function _getOrCreateRtpDescription(iq, mediaType) {
    const jingle = $(iq).find('jingle')[0];
    let content = $(jingle).find(`content[name="${mediaType}"]`);
    let description;

    if (content.length) {
        content = content[0];
    } else {
        // I'm not suree if "creator" and "senders" are required.
        content = $build('content', {
            name: mediaType
        }).node;
        jingle.appendChild(content);
    }

    description = $(content).find('description');

    if (description.length) {
        description = description[0];
    } else {
        description = $build('description', {
            xmlns: XEP.RTP_MEDIA,
            media: mediaType
        }).node;
        content.appendChild(description);
    }

    return description;
}

/**
 * Converts the short string representing SSRC group semantics in compact JSON format to the standard representation
 * (i.e. convert "f" to "FID" and "s" to "SIM").
 * @param {*} str the compact JSON format representation of an SSRC group's semantics.
 * @returns the SSRC group semantics corresponding to [str].
 */
function _getSemantics(str) {
    if (str === 'f') {
        return SSRC_GROUP_SEMANTICS.FID;
    } else if (str === 's') {
        return SSRC_GROUP_SEMANTICS.SIM;
    }

    return null;
}

/**
 * Reads a JSON-encoded message (from a "json-message" element) and extracts source descriptions. Adds the extracted
 * source descriptions to the given Jingle IQ in the standard Jingle format.
 *
 * Encoding sources in this compact JSON format instead of standard Jingle was introduced in order to reduce the
 * network traffic and load on the XMPP server. The format is described in Jicofo [TODO: insert link].
 *
 * @param {*} iq the IQ to which source descriptions will be added.
 * @param {*} jsonMessageXml The XML node for the "json-message" element.
 * @returns {Map<string, Array<string>} The audio and video ssrcs extracted from the JSON-encoded message with remote
 * endpoint id as the key.
 */
export function expandSourcesFromJson(iq, jsonMessageXml) {
    let json;

    try {
        json = safeJsonParse(jsonMessageXml.textContent);
    } catch (error) {
        logger.error(`json-message XML contained invalid JSON, ignoring: ${jsonMessageXml.textContent}`);

        return null;
    }

    if (!json?.sources) {
        // It might be a message of a different type, no need to log.
        return null;
    }

    // This is where we'll add "source" and "ssrc-group" elements. Create them elements if they don't exist.
    const audioRtpDescription = _getOrCreateRtpDescription(iq, MediaType.AUDIO);
    const videoRtpDescription = _getOrCreateRtpDescription(iq, MediaType.VIDEO);
    const ssrcMap = new Map();

    for (const owner in json.sources) {
        if (json.sources.hasOwnProperty(owner)) {
            const ssrcs = [];
            const ownerSources = json.sources[owner];

            // The video sources, video ssrc-groups, audio sources and audio ssrc-groups are encoded in that order in
            // the elements of the array.
            const videoSources = ownerSources?.length && ownerSources[0];
            const videoSsrcGroups = ownerSources?.length > 1 && ownerSources[1];
            const audioSources = ownerSources?.length > 2 && ownerSources[2];
            const audioSsrcGroups = ownerSources?.length > 3 && ownerSources[3];

            if (videoSources?.length) {
                for (let i = 0; i < videoSources.length; i++) {
                    videoRtpDescription.appendChild(_createSourceExtension(owner, videoSources[i], true));
                    ssrcs.push(videoSources[i]?.s);
                }
            }

            if (videoSsrcGroups?.length) {
                for (let i = 0; i < videoSsrcGroups.length; i++) {
                    videoRtpDescription.appendChild(_createSsrcGroupExtension(videoSsrcGroups[i]));
                }
            }
            if (audioSources?.length) {
                for (let i = 0; i < audioSources.length; i++) {
                    audioRtpDescription.appendChild(_createSourceExtension(owner, audioSources[i]));
                    ssrcs.push(audioSources[i]?.s);
                }
            }

            if (audioSsrcGroups?.length) {
                for (let i = 0; i < audioSsrcGroups.length; i++) {
                    audioRtpDescription.appendChild(_createSsrcGroupExtension(audioSsrcGroups[i]));
                }
            }
            ssrcMap.set(owner, ssrcs);
        }
    }

    return ssrcMap;
}
