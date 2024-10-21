import { isEqual } from 'lodash-es';

import { XEP } from '../../service/xmpp/XMPPExtensioProtocols';

import SDPUtil from './SDPUtil';

/**
 * A class that provides methods for comparing the source information present in two different SDPs so that the delta
 * can be signaled to Jicofo via 'source-remove' or 'source-add'.
 */
export class SDPDiffer {
    /**
     * Constructor.
     *
     * @param {SDP} mySdp - the new SDP.
     * @param {SDP} othersSdp - the old SDP.
     * @param {boolean} isP2P - Whether the SDPs belong to a p2p peerconnection.
     */
    constructor(mySdp, othersSdp, isP2P = false) {
        this.isP2P = isP2P;
        this.mySdp = mySdp;
        this.othersSdp = othersSdp;
    }

    /**
     * Returns a map of the sources that are present in 'othersSdp' but not in 'mySdp'.
     *
     * @returns {*}
     */
    getNewMedia() {
        const mySources = this.mySdp.getMediaSsrcMap();
        const othersSources = this.othersSdp.getMediaSsrcMap();
        const diff = {};

        for (const [ index, othersSource ] of othersSources.entries()) {
            const mySource = mySources.get(index);

            if (!mySource) {
                diff[index] = othersSource;
                continue; // eslint-disable-line no-continue
            }

            const othersSsrcs = Object.keys(othersSource.ssrcs);

            if (othersSsrcs.length && !isEqual(Object.keys(mySource.ssrcs).sort(), [ ...othersSsrcs ].sort())) {
                diff[index] = othersSource;
            }
        }

        return diff;
    }

    /**
     * Adds the diff source info to the provided IQ stanza.
     *
     * @param {*} modify - Stanza IQ.
     * @returns {boolean}
     */
    toJingle(modify) {
        let modified = false;
        const diffSourceInfo = this.getNewMedia();

        for (const media of Object.values(diffSourceInfo)) {
            modified = true;
            modify.c('content', { name: this.isP2P ? media.mid : media.mediaType });

            modify.c('description', {
                xmlns: XEP.RTP_MEDIA,
                media: media.mediaType
            });

            Object.keys(media.ssrcs).forEach(ssrcNum => {
                const mediaSsrc = media.ssrcs[ssrcNum];
                const ssrcLines = mediaSsrc.lines;
                const sourceName = SDPUtil.parseSourceNameLine(ssrcLines);
                const videoType = SDPUtil.parseVideoTypeLine(ssrcLines);

                modify.c('source', { xmlns: XEP.SOURCE_ATTRIBUTES });
                modify.attrs({
                    name: sourceName,
                    videoType,
                    ssrc: mediaSsrc.ssrc
                });

                // Only MSID attribute is sent
                const msid = SDPUtil.parseMSIDAttribute(ssrcLines);

                if (msid) {
                    modify.c('parameter');
                    modify.attrs({ name: 'msid' });
                    modify.attrs({ value: msid });
                    modify.up();
                }

                modify.up(); // end of source
            });

            // generate source groups from lines
            media.ssrcGroups.forEach(ssrcGroup => {
                if (ssrcGroup.ssrcs.length) {

                    modify.c('ssrc-group', {
                        semantics: ssrcGroup.semantics,
                        xmlns: XEP.SOURCE_ATTRIBUTES
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
        }

        return modified;
    }
}
