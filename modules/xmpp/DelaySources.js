/* global $ */


/**
 * It's a plugin for the Jingle layer used by {@link JingleSessionPC} to delay
 * remote audio/video streams for larger conferences. The reason is that on
 * mobile adding multiple remote streams is a time consuming process which
 * delays sending ICE candidates to Jicofo and in consequence media connection
 * establishment. It takes a lot of time to hear any audio/see any video. So
 * this plugin is used to capture source description out from the initial offer,
 * as well as any 'source-add'/'source-remove' notifications which may follow.
 * Then after the last ICE candidate is sent, source description is set on the
 * PeerConnection and remote streams are added into the conference. The plugin
 * instance is disposed and 'source-add'/'source-remove' notifications are not
 * captured anymore.
 */
export default class DelaySources {
    /**
     * A selector pointing to audio Jingle contents which describe the remote
     * audio streams.
     * @type {jQuery}
     */
    pendingAudioSources = $();

    /**
     * A selector pointing to audio Jingle contents which describe the remote
     * video streams.
     * @type {jQuery}
     */
    pendingVideoSources = $();

    /**
     * Extract remote stream description from the offer received from Jicofo.
     *
     * @param {jQuery} jingleOffer - a jQuery selector which points to the
     * {@code >jingle} part of the 'session-initiate' IQ.
     */
    processInitialOffer(jingleOffer) {
        const audioSources
            = jingleOffer.find('>content[name="audio"]>description>source');
        const audioContents = this._createContents('audio');

        audioContents.find('>description').append(audioSources.clone());
        this.pendingAudioSources = audioContents;

        audioSources.remove();

        const videoSources
            = jingleOffer.find('>content[name="video"]>description>source');
        const videoGroups
            = jingleOffer.find('>content[name="video"]>description>ssrc-group');
        const videoContents = this._createContents('video');

        videoContents
            .find('>description')
            .append(videoSources.clone())
            .append(videoGroups.clone());
        this.pendingVideoSources = videoContents;

        videoSources.remove();
        videoGroups.remove();
    }

    /**
     * Creates Jingle contents for given name which will be used as both
     * content and media names.
     *
     * @param {string} name - the contents and RTP media name.
     * @return {jQuery}
     */
    _createContents(name) {
        return $(
            `<content name="${name}">`
            + `<description media="${name}" xmlns="urn:xmpp:jingle:apps:rtp:1">`
            + '</description>'
            + '</content>');
    }

    /**
     * Captures the sources received in 'source-add' or 'source-remove'
     * notification.
     *
     * @param {boolean} isAdd - {@code true} if it's the 'source-add' or
     * {@code false} for the 'source-remove'.
     * @param {jQuery} contents - a jQuery selector pointing to the Jingle
     * contents of the iq.
     */
    processAddOrRemoveStream(isAdd, contents) {
        if (isAdd) {
            this._processSourceAdd(contents);
        } else {
            this._processSourceRemove(contents);
        }
    }

    /**
     * Parses 'source-add' and stores any sources described by the notification.
     * The logic doesn't check for correctness, duplication etc. as Jicofo makes
     * sure that the sources are correct.
     *
     * @param {jquery} sourceAddContents - a jQuery selector pointing to the
     * Jingle contents of a 'source-add' iq.
     * @private
     */
    _processSourceAdd(sourceAddContents) {
        // eslint-disable-next-line consistent-this
        const self = this;

        $(sourceAddContents).each((i1, content) => {
            const name = $(content).attr('name');

            if (name !== 'video' && name !== 'audio') {
                return;
            }

            const isAudio = name === 'audio';

            const pendingSources
                = isAudio
                    ? self.pendingAudioSources
                    : self.pendingVideoSources;
            const rtpDescription = pendingSources.find('>description');
            const sources
                = $(content)
                    .find('source[xmlns="urn:xmpp:jingle:apps:rtp:ssma:0"]');

            rtpDescription.append(sources);
            if (!isAudio) {
                const sourceGroups
                    = $(content)
                        .find(
                        'ssrc-group[xmlns="urn:xmpp:jingle:apps:rtp:ssma:0"]');

                rtpDescription.append(sourceGroups);
            }
        });
    }

    /**
     * Parses 'source-remove' and removes any sources described by the
     * notification from the list of pending sources. The logic doesn't check
     * for correctness, duplication etc. as Jicofo makes sure that the sources
     * are correct.
     *
     * @param {jquery} sourceRemoveContents - a jQuery selector pointing to the
     * Jingle contents of a 'source-remove' iq.
     * @private
     */
    _processSourceRemove(sourceRemoveContents) {
        // eslint-disable-next-line consistent-this
        const _this = this;

        $(sourceRemoveContents).each((i1, content) => {
            const name = $(content).attr('name');

            if (name !== 'video' && name !== 'audio') {
                return;
            }

            const isAudio = name === 'audio';
            const ssrcs = [];

            const removedSources
                = $(content).find(
                    'source[xmlns="urn:xmpp:jingle:apps:rtp:ssma:0"]');

            removedSources.each(function() {
                // eslint-disable-next-line no-invalid-this
                const ssrc = $(this).attr('ssrc');

                ssrcs.push(ssrc);
            });

            const pendingSources
                = isAudio
                    ? _this.pendingAudioSources : _this.pendingVideoSources;

            // Remove groups which contain removed sources:
            // Note that there is not logic which would get SSRCs from
            // <source-group/> and look to remove them, because a group can not
            // exists without SSRC signalled in the <source/> and this
            // constraint is enforced by Jicofo. This means we can simplify the
            // logic to remove whole group if at least one group's SSRC is
            // removed.
            if (!isAudio) {
                for (const ssrc of ssrcs) {
                    pendingSources
                        .find(`source[ssrc="${ssrc}"]`)
                        .closest('ssrc-group')
                        .remove();
                }
            }

            for (const ssrc of ssrcs) {
                pendingSources.find(`source[ssrc="${ssrc}"]`).remove();
            }
        });
    }

    /**
     * Returns a Jquery selector pointing to Jingle contents describing
     * the audio/video remote streams.
     *
     * @return {jQuery}
     */
    getPendingSourceAdd() {
        return $()
            .add(this.pendingAudioSources)
            .add(this.pendingVideoSources);
    }
}
