/* global $ */
import DelaySources from './DelaySources';

/* eslint-disable prefer-arrow-callback */
/* eslint-disable no-invalid-this */
/* eslint-disable max-len*/

/**
 * Creates XML describing sources from the given array.
 * @param {Array<number|string>} ssrcs - an array with SSRCs as {@code number}s
 * or {@code string}s.
 * @return {string}
 */
function createSources(ssrcs) {
    let sources = '';

    for (const ssrc of ssrcs) {
        sources
            += `<source ssrc="${ssrc}" xmlns="urn:xmpp:jingle:apps:rtp:ssma:0">`
               + '<parameter value="something" name="cname"></parameter>'
               + '<parameter value="tracklabel" name="label"></parameter>'
               + '<parameter value="streamlabel tracklabel" name="msid"></parameter>'
               + '<parameter value="streamlabel" name="mslabel"></parameter>'
               + '<ssrc-info owner="jvb" xmlns="http://jitsi.org/jitmeet"></ssrc-info>'
               + '</source>';
    }

    return sources;
}

/**
 * Creates XML describing a source group.
 *
 * @param {string} semantics - the group's semantics.
 * @param {Array<string|number} ssrcs - an array with the group's sources.
 * @return {string}
 */
function createSourceGroup(semantics, ssrcs) {
    let group = `<ssrc-group semantics="${semantics}" xmlns="urn:xmpp:jingle:apps:rtp:ssma:0">`;

    for (const ssrc of ssrcs) {
        group += `<source ssrc="${ssrc}"/>`;
    }

    return `${group}</ssrc-group>`;
}

/**
 * @typedef {Object} SourceGroup
 * @property {string} semantics - group's semantics.
 * @property {Array<string|number>} ssrcs - array with group's sources.
 */
/**
 * Creates XML describing given source groups.
 * @param {Array<SourceGroup>} ssrcGroups - an array of the groups to be
 * described in the XML.
 * @return {string}
 */
function createSourceGroups(ssrcGroups) {
    let groups = '';

    if (ssrcGroups) {
        for (const { semantics, ssrcs } of ssrcGroups) {
            groups += createSourceGroup(semantics, ssrcs);
        }
    }

    return groups;
}

/**
 * Creates the RTP description part of Jingle XML.
 * @param {Array<string|number>} ssrcs - the SSRCs to be included in the RTP
 * description.
 * @param {Array<SourceGroup>} ssrcGroups - the source groups to be included in
 * the RTP description.
 * @return {string}
 */
function createRtpDescription(ssrcs, ssrcGroups) {
    return `<description maxptime="60" media="audio" xmlns="urn:xmpp:jingle:apps:rtp:1">
                ${createSources(ssrcs)}${createSourceGroups(ssrcGroups)}
            </description>`;
}

/**
 * Creates XML with Jingle contents.
 * @param {string} name - content's name which will be also used as the media
 * name for the RTP description.
 * @param {Array<string|number>} ssrcs - the array of SSRCs which are to be part
 * of the RTP description.
 * @param {Array<SourceGroup>} ssrcGroups - the source groups to be included in
 * the RTP description.
 * @return {string}
 */
function createContents(name, ssrcs, ssrcGroups) {
    return `<content name="${name}">
                ${createRtpDescription(ssrcs, ssrcGroups)}
            </content>`;
}

/**
 * Generates an SSRC array with numbers starting from {@code base}, increased by
 * {@code inc} until {@code count} SSRCs are generated.
 * @param {number} base - the first SSRC number.
 * @param {number} inc - added to the last SSRC value to calculate the next one.
 * @param {number} count - the number of SSRCs to create.
 * @return {Array}
 */
function createSsrcArray({ base, inc, count }) {
    const result = [];
    let ssrcCounter = base;

    for (let i = 0; i < count; i += 1) {
        result.push(ssrcCounter);
        ssrcCounter += inc;
    }

    return result;
}

/**
 * Creates 'audio' Jingle contents with 12 SSRCs starting from 1 to 12.
 * @return {string}
 */
function createAudioContents() {
    return createContents(
        'audio', createSsrcArray({
            base: 1,
            inc: 1,
            count: 12
        }));
}

/**
 * Generates a source group object for given params.
 * @param {number} base - the value of the first SSRC in the group.
 * @param {number} inc - how much added to get next SSRC in the group.
 * @param {number} count - how many SSRCs will be in the group.
 * @param {string} semantics - the group's semantics.
 * @return {SourceGroup}
 */
function describeSsrcGroup({ base, inc, count, semantics }) {
    return {
        semantics,
        ssrcs: createSsrcArray({
            base,
            inc,
            count
        })
    };
}

/**
 * Generates a sample video Jingle contents with 12 SSRCs, three FID groups and
 * one SIM group.
 * @return {string}
 */
function createVideoContents() {
    const videoSsrcs
        = createSsrcArray({
            base: 10,
            inc: 1,
            count: 3
        })
        .concat(createSsrcArray({
            base: 20,
            inc: 1,
            count: 3
        }))
        .concat(createSsrcArray({
            base: 30,
            inc: 1,
            count: 3
        }));
    const videoGroups = [];

    videoGroups.push(describeSsrcGroup({
        base: 10,
        inc: 1,
        count: 3,
        semantics: 'FID'
    }));
    videoGroups.push(describeSsrcGroup({
        base: 20,
        inc: 1,
        count: 3,
        semantics: 'FID'
    }));
    videoGroups.push(describeSsrcGroup({
        base: 30,
        inc: 1,
        count: 3,
        semantics: 'FID'
    }));
    videoGroups.push(describeSsrcGroup({
        base: 10,
        inc: 10,
        count: 3,
        semantics: 'SIM'
    }));

    return createContents('video', videoSsrcs, videoGroups);
}

/**
 * Creates a sample Jingle offer with 12 audio SSRCs, 9 video SSRCs and 4 video
 * groups.
 * @return {string}
 */
function createOffer() {
    return `<jingle action="session-initiate" xmlns="urn:xmpp:jingle:1">
                ${createAudioContents()}
                ${createVideoContents()}
            </jingle>`;
}

/**
 * Checks if pending operation contains specified amount of specific SSRCs and
 * source groups.
 * @param {DelaySources} delaySources - the {@link DelaySources} instance from
 * which the pending operation will be retrieved.
 * @param {number} audioSrcCount - how many audio sources are expected.
 * @param {number} videoSrcCount - how many video sources are expected.
 * @param {number} videoGroupCount - how many video groups are expected.
 */
function verifyPendingOperation(
        delaySources,
        { audioSrcCount, videoSrcCount, videoGroupCount }) {
    const pending = delaySources.getPendingSourceAdd();

    expect(pending).toBeTruthy();
    expect(pending.find('>description[media="audio"]>source').length).toEqual(audioSrcCount);

    const videoSources = pending.find('>description[media="video"]>source');

    expect(videoSources.length).toEqual(videoSrcCount);

    const videoGroups = pending.find('>description[media="video"]>ssrc-group');

    expect(videoGroups.length).toEqual(videoGroupCount);
}

describe('DelaySources', () => {
    beforeEach(function() {
        this.delaySources = new DelaySources();
    });

    describe('when given a jingle offer', () => {
        beforeEach(function() {
            this.delaySources.processInitialOffer($(createOffer()));
        });

        it('should extract sources from the initial offer', function() {
            verifyPendingOperation(this.delaySources, {
                audioSrcCount: 12,
                videoSrcCount: 9,
                videoGroupCount: 4
            });
        });

        it('should remove and add back audio sources', function() {
            this.delaySources.processAddOrRemoveStream(
                /* remove */ false,
                $(createContents('audio',
                    createSsrcArray({
                        base: 1,
                        inc: 1,
                        count: 12
                    }))));
            verifyPendingOperation(this.delaySources, {
                audioSrcCount: 0,
                videoSrcCount: 9,
                videoGroupCount: 4
            });

            this.delaySources.processAddOrRemoveStream(
                /* add */ true,
                $(createContents('audio',
                    createSsrcArray({
                        base: 1,
                        inc: 1,
                        count: 12
                    }))));
            verifyPendingOperation(this.delaySources, {
                audioSrcCount: 12,
                videoSrcCount: 9,
                videoGroupCount: 4
            });
        });

        it('should remove and add back video sources', function() {
            this.delaySources.processAddOrRemoveStream(
                /* remove */ false,
                $(createContents('video',
                    createSsrcArray({
                        base: 10,
                        inc: 1,
                        count: 3
                    }))));
            verifyPendingOperation(this.delaySources, {
                audioSrcCount: 12,
                videoSrcCount: 6,
                videoGroupCount: 2
            });

            this.delaySources.processAddOrRemoveStream(
                /* remove */ false,
                $(createContents('video',
                    createSsrcArray({
                        base: 20,
                        inc: 1,
                        count: 3
                    }))));
            verifyPendingOperation(this.delaySources, {
                audioSrcCount: 12,
                videoSrcCount: 3,
                videoGroupCount: 1
            });

            this.delaySources.processAddOrRemoveStream(
                /* remove */ false,
                $(createContents('video',
                    createSsrcArray({
                        base: 30,
                        inc: 1,
                        count: 3
                    }))));
            verifyPendingOperation(this.delaySources, {
                audioSrcCount: 12,
                videoSrcCount: 0,
                videoGroupCount: 0
            });

            this.delaySources.processAddOrRemoveStream(
                /* add */ true,
                $(createContents('video',
                    createSsrcArray({
                        base: 30,
                        inc: 1,
                        count: 3
                    }))));
            verifyPendingOperation(this.delaySources, {
                audioSrcCount: 12,
                videoSrcCount: 3,
                videoGroupCount: 0
            });
        });
    });
});

/* eslint-enable prefer-arrow-callback */
/* eslint-enable no-invalid-this */
/* eslint-enable max-len*/
