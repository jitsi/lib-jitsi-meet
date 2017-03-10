const SDPUtil = require('./SDPUtil');

function SDPDiffer(mySDP, otherSDP) {
    this.mySDP = mySDP;
    this.otherSDP = otherSDP;
}

/**
 * Returns map of MediaChannel that contains media contained in
 * 'mySDP', but not contained in 'otherSdp'. Mapped by channel idx.
 */
SDPDiffer.prototype.getNewMedia = function() {

    // this could be useful in Array.prototype.
    function arrayEquals(array) {
        // if the other array is a falsy value, return
        if (!array) {
            return false;
        }

        // compare lengths - can save a lot of time
        if (this.length != array.length) {
            return false;
        }

        for (let i = 0, l = this.length; i < l; i++) {
            // Check if we have nested arrays
            if (this[i] instanceof Array && array[i] instanceof Array) {
                // recurse into the nested arrays
                if (!this[i].equals(array[i])) {
                    return false;
                }
            } else if (this[i] != array[i]) {
                // Warning - two different object instances will never be
                // equal: {x:20} != {x:20}
                return false;
            }
        }

        return true;
    }

    const myMedias = this.mySDP.getMediaSsrcMap();
    const othersMedias = this.otherSDP.getMediaSsrcMap();
    const newMedia = {};

    Object.keys(othersMedias).forEach(othersMediaIdx => {
        const myMedia = myMedias[othersMediaIdx];
        const othersMedia = othersMedias[othersMediaIdx];

        if (!myMedia && othersMedia) {
            // Add whole channel
            newMedia[othersMediaIdx] = othersMedia;

            return;
        }
        // Look for new ssrcs across the channel
        Object.keys(othersMedia.ssrcs).forEach(ssrc => {
            if (Object.keys(myMedia.ssrcs).indexOf(ssrc) === -1) {
                // Allocate channel if we've found ssrc that doesn't exist in
                // our channel
                if (!newMedia[othersMediaIdx]) {
                    newMedia[othersMediaIdx] = {
                        mediaindex: othersMedia.mediaindex,
                        mid: othersMedia.mid,
                        ssrcs: {},
                        ssrcGroups: []
                    };
                }
                newMedia[othersMediaIdx].ssrcs[ssrc] = othersMedia.ssrcs[ssrc];
            }
        });

        // Look for new ssrc groups across the channels
        othersMedia.ssrcGroups.forEach(otherSsrcGroup => {

            // try to match the other ssrc-group with an ssrc-group of ours
            let matched = false;

            for (let i = 0; i < myMedia.ssrcGroups.length; i++) {
                const mySsrcGroup = myMedia.ssrcGroups[i];

                if (otherSsrcGroup.semantics == mySsrcGroup.semantics
                    && arrayEquals.apply(otherSsrcGroup.ssrcs,
                                      [ mySsrcGroup.ssrcs ])) {

                    matched = true;
                    break;
                }
            }

            if (!matched) {
                // Allocate channel if we've found an ssrc-group that doesn't
                // exist in our channel

                if (!newMedia[othersMediaIdx]) {
                    newMedia[othersMediaIdx] = {
                        mediaindex: othersMedia.mediaindex,
                        mid: othersMedia.mid,
                        ssrcs: {},
                        ssrcGroups: []
                    };
                }
                newMedia[othersMediaIdx].ssrcGroups.push(otherSsrcGroup);
            }
        });
    });

    return newMedia;
};

/**
 * TODO: document!
 */
SDPDiffer.prototype.toJingle = function(modify) {
    const sdpMediaSsrcs = this.getNewMedia();

    let modified = false;

    Object.keys(sdpMediaSsrcs).forEach(mediaindex => {
        modified = true;
        const media = sdpMediaSsrcs[mediaindex];

        modify.c('content', { name: media.mid });

        modify.c('description',
                 { xmlns: 'urn:xmpp:jingle:apps:rtp:1', media: media.mid });
        // FIXME: not completely sure this operates on blocks and / or handles
        // different ssrcs correctly
        // generate sources from lines
        Object.keys(media.ssrcs).forEach(ssrcNum => {
            const mediaSsrc = media.ssrcs[ssrcNum];

            modify.c('source', { xmlns: 'urn:xmpp:jingle:apps:rtp:ssma:0' });
            modify.attrs({ ssrc: mediaSsrc.ssrc });
            // iterate over ssrc lines
            mediaSsrc.lines.forEach(line => {
                const idx = line.indexOf(' ');
                const kv = line.substr(idx + 1);

                modify.c('parameter');
                if (kv.indexOf(':') == -1) {
                    modify.attrs({ name: kv });
                } else {
                    const nv = kv.split(':', 2);
                    const name = nv[0];
                    const value = SDPUtil.filter_special_chars(nv[1]);

                    modify.attrs({ name });
                    modify.attrs({ value });
                }
                modify.up(); // end of parameter
            });
            modify.up(); // end of source
        });

        // generate source groups from lines
        media.ssrcGroups.forEach(ssrcGroup => {
            if (ssrcGroup.ssrcs.length) {

                modify.c('ssrc-group', {
                    semantics: ssrcGroup.semantics,
                    xmlns: 'urn:xmpp:jingle:apps:rtp:ssma:0'
                });

                ssrcGroup.ssrcs.forEach(ssrc => {
                    modify.c('source', { ssrc })
                        .up(); // end of source
                });
                modify.up(); // end of ssrc-group
            }
        });

        modify.up(); // end of description
        modify.up(); // end of content
    });

    return modified;
};

module.exports = SDPDiffer;
