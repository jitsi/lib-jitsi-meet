import { getLogger } from '@jitsi/logger';
const logger = getLogger('modules/sdp/SDPUtil');

import { CodecMimeType } from '../../service/RTC/CodecMimeType';
import { MediaDirection } from '../../service/RTC/MediaDirection';
import { SSRC_GROUP_SEMANTICS } from '../../service/RTC/StandardVideoQualitySettings';
import browser from '../browser';
import RandomUtil from '../util/RandomUtil';

// Type definitions for SDP utility return types
interface ICEParams {
    ufrag: string;
    pwd: string;
}

interface MLineData {
    media: string;
    port: string;
    proto: string;
    fmt: string[];
}

interface RTPMapData {
    id: string;
    name: string;
    clockrate: string;
    channels: string;
}

interface CryptoData {
    tag: string;
    'crypto-suite': string;
    'key-params': string;
    'session-params'?: string;
}

interface FingerprintData {
    hash: string;
    fingerprint: string;
}

interface ICECandidate {
    foundation: string;
    component: string;
    protocol: string;
    priority: string;
    ip: string;
    port: string;
    type: string;
    generation: number | string;
    'rel-addr'?: string;
    'rel-port'?: string;
    tcptype?: string;
    network: string;
    id: string;
    hasOwnAttribute?: (attr: string) => boolean;
}

interface FmtpData {
    name: string;
    value: string;
}

interface RTCPFBData {
    pt: string;
    type: string;
    params: string[];
}

interface ExtmapData {
    value: string;
    direction: string;
    uri: string;
    params: string[];
}

interface SSRCGroupData {
    semantics: string;
    ssrcs: string[];
}

const SDPUtil = {
    filterSpecialChars(text: string): string {
        // XXX Neither one of the falsy values (e.g. null, undefined, false,
        // "", etc.) "contain" special chars.
        // eslint-disable-next-line no-useless-escape
        return text ? text.replace(/[\\\/\{,\}\+]/g, '') : text;
    },
    iceparams(mediadesc: string, sessiondesc?: string): ICEParams | null {
        let data = null;
        let pwd, ufrag;

        if ((ufrag = SDPUtil.findLine(mediadesc, 'a=ice-ufrag:', sessiondesc))
                && (pwd
                    = SDPUtil.findLine(
                        mediadesc,
                        'a=ice-pwd:',
                        sessiondesc))) {
            data = {
                ufrag: SDPUtil.parseICEUfrag(ufrag),
                pwd: SDPUtil.parseICEPwd(pwd)
            };
        }

        return data;
    },
    parseICEUfrag(line: string): string {
        return line.substring(12);
    },
    buildICEUfrag(frag: string): string {
        return `a=ice-ufrag:${frag}`;
    },
    parseICEPwd(line: string): string {
        return line.substring(10);
    },
    buildICEPwd(pwd: string): string {
        return `a=ice-pwd:${pwd}`;
    },
    parseMID(line: string): string {
        return line.substring(6);
    },

    /**
     * Finds the MSID attribute in the given array of SSRC attribute lines and returns the value.
     *
     * @param {string[]} ssrcLines - an array of lines similar to 'a:213123 msid:stream-id track-id'.
     * @returns {undefined|string}
     */
    parseMSIDAttribute(ssrcLines: string[]): string | undefined {
        const msidLine = ssrcLines.find(line => line.indexOf(' msid:') > 0);

        if (!msidLine) {
            return undefined;
        }

        const v = msidLine.substring(msidLine.indexOf(' msid:') + 6 /* the length of ' msid:' */);

        return SDPUtil.filterSpecialChars(v);
    },
    parseMLine(line: string): MLineData {
        const data: MLineData = {
            media: '',
            port: '',
            proto: '',
            fmt: []
        };
        const parts = line.substring(2).split(' ');

        data.media = parts.shift() || '';
        data.port = parts.shift() || '';
        data.proto = parts.shift() || '';
        if (parts[parts.length - 1] === '') { // trailing whitespace
            parts.pop();
        }
        data.fmt = parts;

        return data;
    },
    buildMLine(mline: MLineData): string {
        return (
            `m=${mline.media} ${mline.port} ${mline.proto} ${
                mline.fmt.join(' ')}`);
    },
    parseRTPMap(line: string): RTPMapData {
        const data: RTPMapData = {
            id: '',
            name: '',
            clockrate: '',
            channels: ''
        };
        let parts = line.substring(9).split(' ');

        data.id = parts.shift() || '';
        parts = parts[0].split('/');
        data.name = parts.shift() || '';
        data.clockrate = parts.shift() || '';
        data.channels = parts.length ? parts.shift() || '1' : '1';

        return data;
    },

    /**
     * Parses SDP line "a=sctpmap:..." and extracts SCTP port from it.
     * @param line eg. "a=sctpmap:5000 webrtc-datachannel"
     * @returns [SCTP port number, protocol, streams]
     */
    parseSCTPMap(line: string): [string, string, string | null] {
        const parts = line.substring(10).split(' ');
        const sctpPort = parts[0];
        const protocol = parts[1];

        // Stream count is optional
        const streamCount = parts.length > 2 ? parts[2] : null;

        return [ sctpPort, protocol, streamCount ];// SCTP port
    },
    parseSCTPPort(line: string): string {
        return line.substring(12);
    },
    buildRTPMap(el: Element): string {
        let line
            = `a=rtpmap:${el.getAttribute('id')} ${el.getAttribute('name')}/${
                el.getAttribute('clockrate')}`;

        if (el.getAttribute('channels')
            && el.getAttribute('channels') !== '1') {
            line += `/${el.getAttribute('channels')}`;
        }

        return line;
    },
    parseCrypto(line: string): CryptoData {
        const data: CryptoData = {
            tag: '',
            'crypto-suite': '',
            'key-params': ''
        };
        const parts = line.substring(9).split(' ');

        data.tag = parts.shift() || '';
        data['crypto-suite'] = parts.shift() || '';
        data['key-params'] = parts.shift() || '';
        if (parts.length) {
            data['session-params'] = parts.join(' ');
        }

        return data;
    },
    parseFingerprint(line: string): FingerprintData { // RFC 4572
        const data: FingerprintData = {
            hash: '',
            fingerprint: ''
        };
        const parts = line.substring(14).split(' ');

        data.hash = parts.shift() || '';
        data.fingerprint = parts.shift() || '';

        // TODO assert that fingerprint satisfies 2UHEX *(":" 2UHEX) ?
        return data;
    },
    parseFmtp(line: string): FmtpData[] {
        const data: FmtpData[] = [];
        let parts = line.split(' ');

        parts.shift();
        parts = parts.join(' ').split(';');
        for (let i = 0; i < parts.length; i++) {
            let key = parts[i].split('=')[0];

            while (key.length && key[0] === ' ') {
                key = key.substring(1);
            }
            const value = parts[i].split('=')[1];

            if (key && value) {
                data.push({ name: key,
                    value });
            } else if (key) {
                // rfc 4733 (DTMF) style stuff
                data.push({ name: '',
                    value: key });
            }
        }

        return data;
    },
    parseICECandidate(line: string): ICECandidate {
        const candidate: ICECandidate = {
            foundation: '',
            component: '',
            protocol: '',
            priority: '',
            ip: '',
            port: '',
            type: '',
            generation: 0,
            network: '',
            id: ''
        };
        const elems = line.split(' ');

        candidate.foundation = elems[0].substring(12);
        candidate.component = elems[1];
        candidate.protocol = elems[2].toLowerCase();
        candidate.priority = elems[3];
        candidate.ip = elems[4];
        candidate.port = elems[5];

        // elems[6] => "typ"
        candidate.type = elems[7];
        candidate.generation = 0; // default value, may be overwritten below
        for (let i = 8; i < elems.length; i += 2) {
            switch (elems[i]) {
            case 'raddr':
                candidate['rel-addr'] = elems[i + 1];
                break;
            case 'rport':
                candidate['rel-port'] = elems[i + 1];
                break;
            case 'generation':
                candidate.generation = elems[i + 1];
                break;
            case 'tcptype':
                candidate.tcptype = elems[i + 1];
                break;
            default: // TODO
                logger.debug(
                    `parseICECandidate not translating "${
                        elems[i]}" = "${elems[i + 1]}"`);
            }
        }
        candidate.network = '1';

        // not applicable to SDP -- FIXME: should be unique, not just random
        // eslint-disable-next-line newline-per-chained-call
        candidate.id = Math.random().toString(36).substr(2, 10);

        return candidate;
    },
    buildICECandidate(cand: ICECandidate): string {
        let line = [
            `a=candidate:${cand.foundation}`,
            cand.component,
            cand.protocol,
            cand.priority,
            cand.ip,
            cand.port,
            'typ',
            cand.type
        ].join(' ');

        line += ' ';
        switch (cand.type) {
        case 'srflx':
        case 'prflx':
        case 'relay':
            if (cand.hasOwnAttribute && cand.hasOwnAttribute('rel-addr')
                    && cand.hasOwnAttribute('rel-port')) {
                line += 'raddr';
                line += ' ';
                line += cand['rel-addr'];
                line += ' ';
                line += 'rport';
                line += ' ';
                line += cand['rel-port'];
                line += ' ';
            }
            break;
        }
        if (cand.hasOwnAttribute && cand.hasOwnAttribute('tcptype')) {
            line += 'tcptype';
            line += ' ';
            line += cand.tcptype;
            line += ' ';
        }
        line += 'generation';
        line += ' ';
        line += (cand.hasOwnAttribute && cand.hasOwnAttribute('generation')) ? cand.generation : '0';

        return line;
    },
    parseSSRC(desc: string): Map<string, string[]> {
        // proprietary mapping of a=ssrc lines
        // TODO: see "Jingle RTP Source Description" by Juberti and P. Thatcher
        // on google docs and parse according to that
        const data = new Map<string, string[]>();
        const lines = desc.split('\r\n');

        for (let i = 0; i < lines.length; i++) {
            if (lines[i].substring(0, 7) === 'a=ssrc:') {
                // FIXME: Use regex to smartly find the ssrc.
                const ssrc = lines[i].split('a=ssrc:')[1].split(' ')[0];

                if (!data.get(ssrc)) {
                    data.set(ssrc, []);
                }

                data.get(ssrc)!.push(lines[i]);
            }
        }

        return data;
    },

    /**
     * Parses the 'a=ssrc-group' line.
     *
     * @param {string} line - The media line to parse.
     * @returns {object}
     */
    parseSSRCGroupLine(line: string): SSRCGroupData {
        const parts = line.substr(13).split(' ');

        return {
            semantics: parts.shift() || '',
            ssrcs: parts
        };
    },

    /**
     * Gets the source name out of the name attribute "a=ssrc:254321 name:name1".
     *
     * @param {string[]} ssrcLines
     * @returns {string | undefined}
     */
    parseSourceNameLine(ssrcLines: string[]): string | undefined {
        const sourceNameLine = ssrcLines.find(ssrcSdpLine => ssrcSdpLine.indexOf(' name:') > 0);

        // Everything past the "name:" part
        return sourceNameLine?.substring(sourceNameLine.indexOf(' name:') + 6);
    },

    /**
     * Parse the "videoType" attribute encoded in a set of SSRC attributes (e.g.
     * "a=ssrc:1234 videoType:desktop")
     *
     * @param {string[]} ssrcLines
     * @returns {string | undefined}
     */
    parseVideoTypeLine(ssrcLines: string[]): string | undefined {
        const s = ' videoType:';
        const videoTypeLine = ssrcLines.find(ssrcSdpLine => ssrcSdpLine.indexOf(s) > 0);

        return videoTypeLine?.substring(videoTypeLine.indexOf(s) + s.length);
    },
    parseRTCPFB(line: string): RTCPFBData {
        const parts = line.substr(10).split(' ');
        const data: RTCPFBData = {
            pt: '',
            type: '',
            params: []
        };

        data.pt = parts.shift() || '';
        data.type = parts.shift() || '';
        data.params = parts;

        return data;
    },
    parseExtmap(line: string): ExtmapData {
        const parts = line.substr(9).split(' ');
        const data: ExtmapData = {
            value: '',
            direction: '',
            uri: '',
            params: []
        };

        data.value = parts.shift() || '';
        if (data.value.indexOf('/') === -1) {
            data.direction = 'both';
        } else {
            data.direction = data.value.substr(data.value.indexOf('/') + 1);
            data.value = data.value.substr(0, data.value.indexOf('/'));
        }
        data.uri = parts.shift() || '';
        data.params = parts;

        return data;
    },
    findLine(haystack: string, needle: string, sessionpart?: string): string | false {
        let lines = haystack.split('\r\n');

        for (let i = 0; i < lines.length; i++) {
            if (lines[i].substring(0, needle.length) === needle) {
                return lines[i];
            }
        }
        if (!sessionpart) {
            return false;
        }

        // search session part
        lines = sessionpart.split('\r\n');
        for (let j = 0; j < lines.length; j++) {
            if (lines[j].substring(0, needle.length) === needle) {
                return lines[j];
            }
        }

        return false;
    },
    findLines(haystack: string, needle: string, sessionpart?: string): string[] {
        let lines = haystack.split('\r\n');
        const needles: string[] = [];

        for (let i = 0; i < lines.length; i++) {
            if (lines[i].substring(0, needle.length) === needle) {
                needles.push(lines[i]);
            }
        }
        if (needles.length || !sessionpart) {
            return needles;
        }

        // search session part
        lines = sessionpart.split('\r\n');
        for (let j = 0; j < lines.length; j++) {
            if (lines[j].substring(0, needle.length) === needle) {
                needles.push(lines[j]);
            }
        }

        return needles;
    },
    candidateToJingle(line: string): ICECandidate | null {
        // a=candidate:2979166662 1 udp 2113937151 192.168.2.100 57698 typ host
        // generation 0
        //      <candidate component=... foundation=... generation=... id=...
        // ip=... network=... port=... priority=... protocol=... type=.../>
        if (line.indexOf('candidate:') === 0) {
            // eslint-disable-next-line no-param-reassign
            line = `a=${line}`;
        } else if (line.substring(0, 12) !== 'a=candidate:') {
            logger.warn(
                'parseCandidate called with a line that is not a candidate'
                    + ' line');
            logger.warn(line);

            return null;
        }
        if (line.substring(line.length - 2) === '\r\n') { // chomp it
            // eslint-disable-next-line no-param-reassign
            line = line.substring(0, line.length - 2);
        }
        const candidate: ICECandidate = {
            foundation: '',
            component: '',
            protocol: '',
            priority: '',
            ip: '',
            port: '',
            type: '',
            generation: '0',
            network: '',
            id: ''
        };
        const elems = line.split(' ');

        if (elems[6] !== 'typ') {
            logger.warn('did not find typ in the right place');
            logger.warn(line);

            return null;
        }
        candidate.foundation = elems[0].substring(12);
        candidate.component = elems[1];
        candidate.protocol = elems[2].toLowerCase();
        candidate.priority = elems[3];
        candidate.ip = elems[4];
        candidate.port = elems[5];

        // elems[6] => "typ"
        candidate.type = elems[7];

        candidate.generation = '0'; // default, may be overwritten below
        for (let i = 8; i < elems.length; i += 2) {
            switch (elems[i]) {
            case 'raddr':
                candidate['rel-addr'] = elems[i + 1];
                break;
            case 'rport':
                candidate['rel-port'] = elems[i + 1];
                break;
            case 'generation':
                candidate.generation = elems[i + 1];
                break;
            case 'tcptype':
                candidate.tcptype = elems[i + 1];
                break;
            default: // TODO
                logger.debug(`not translating "${elems[i]}" = "${elems[i + 1]}"`);
            }
        }
        candidate.network = '1';

        // not applicable to SDP -- FIXME: should be unique, not just random
        // eslint-disable-next-line newline-per-chained-call
        candidate.id = Math.random().toString(36).substr(2, 10);

        return candidate;
    },
    candidateFromJingle(cand: Element): string {
        let line = 'a=candidate:';

        line += cand.getAttribute('foundation');
        line += ' ';
        line += cand.getAttribute('component');
        line += ' ';

        let protocol = cand.getAttribute('protocol');

        // use tcp candidates for FF

        if (browser.isFirefox() && protocol && protocol.toLowerCase() === 'ssltcp') {
            protocol = 'tcp';
        }

        line += protocol; // .toUpperCase(); // chrome M23 doesn't like this
        line += ' ';
        line += cand.getAttribute('priority');
        line += ' ';
        line += cand.getAttribute('ip');
        line += ' ';
        line += cand.getAttribute('port');
        line += ' ';
        line += 'typ';
        line += ` ${cand.getAttribute('type')}`;
        line += ' ';
        switch (cand.getAttribute('type')) {
        case 'srflx':
        case 'prflx':
        case 'relay':
            if (cand.getAttribute('rel-addr')
                    && cand.getAttribute('rel-port')) {
                line += 'raddr';
                line += ' ';
                line += cand.getAttribute('rel-addr');
                line += ' ';
                line += 'rport';
                line += ' ';
                line += cand.getAttribute('rel-port');
                line += ' ';
            }
            break;
        }
        if (protocol && protocol.toLowerCase() === 'tcp') {
            line += 'tcptype';
            line += ' ';
            line += cand.getAttribute('tcptype');
            line += ' ';
        }
        line += 'generation';
        line += ' ';
        line += cand.getAttribute('generation') || '0';

        return `${line}\r\n`;
    },

    /**
     * Parse the 'most' primary video ssrc from the given m line
     * @param {object} mLine object as parsed from transform.parse
     * @return {number} the primary video ssrc from the given m line
     */
    parsePrimaryVideoSsrc(videoMLine: any): number | undefined {
        const numSsrcs = videoMLine.ssrcs
            .map((ssrcInfo: any) => ssrcInfo.id)
            .filter((ssrc: any, index: number, array: any[]) => array.indexOf(ssrc) === index)
            .length;
        const numGroups
            = (videoMLine.ssrcGroups && videoMLine.ssrcGroups.length) || 0;

        if (numSsrcs > 1 && numGroups === 0) {
            // Ambiguous, can't figure out the primary
            return;
        }
        let primarySsrc = null;

        if (numSsrcs === 1) {
            primarySsrc = videoMLine.ssrcs[0].id;
        } else if (numSsrcs === 2) {
            // Can figure it out if there's an FID group
            const fidGroup
                = videoMLine.ssrcGroups.find(
                    (group: any) => group.semantics === SSRC_GROUP_SEMANTICS.FID);

            if (fidGroup) {
                primarySsrc = fidGroup.ssrcs.split(' ')[0];
            }
        } else if (numSsrcs >= 3) {
            // Can figure it out if there's a sim group
            const simGroup
                = videoMLine.ssrcGroups.find(
                    (group: any) => group.semantics === SSRC_GROUP_SEMANTICS.SIM);

            if (simGroup) {
                primarySsrc = simGroup.ssrcs.split(' ')[0];
            }
        }

        return primarySsrc;
    },

    /**
     * Generate an ssrc
     * @returns {number} an ssrc
     */
    generateSsrc(): number {
        return RandomUtil.randomInt(1, 0xffffffff);
    },

    /**
     * Get an attribute for the given ssrc with the given attributeName
     *  from the given mline
     * @param {object} mLine an mLine object as parsed from transform.parse
     * @param {number} ssrc the ssrc for which an attribute is desired
     * @param {string} attributeName the name of the desired attribute
     * @returns {string} the value corresponding to the given ssrc
     *  and attributeName
     */
    getSsrcAttribute(mLine: any, ssrc: number, attributeName: string): string | undefined {
        for (let i = 0; i < mLine.ssrcs.length; ++i) {
            const ssrcLine = mLine.ssrcs[i];

            if (ssrcLine.id === ssrc
                && ssrcLine.attribute === attributeName) {
                return ssrcLine.value;
            }
        }
    },

    /**
     * Parses the ssrcs from the group sdp line and
     *  returns them as a list of numbers
     * @param {object} the ssrcGroup object as parsed from
     *  sdp-transform
     * @returns {list<number>} a list of the ssrcs in the group
     *  parsed as numbers
     */
    parseGroupSsrcs(ssrcGroup: any): number[] {
        return ssrcGroup
            .ssrcs
            .split(' ')
            .map((ssrcStr: string) => parseInt(ssrcStr, 10));
    },

    /**
     * Get the mline of the given type from the given sdp
     * @param {object} sdp sdp as parsed from transform.parse
     * @param {string} type the type of the desired mline (e.g. "video")
     * @returns {object} a media object
     */
    getMedia(sdp: any, type: string): any {
        return sdp.media.find((m: any) => m.type === type);
    },

    /**
     * Extracts the ICE username fragment from an SDP string.
     * @param {string} sdp the SDP in raw text format
     */
    getUfrag(sdp: string): string | undefined {
        const ufragLines
            = sdp.split('\n').filter(line => line.startsWith('a=ice-ufrag:'));

        if (ufragLines.length > 0) {
            return ufragLines[0].substr('a=ice-ufrag:'.length);
        }
    },

    /**
     * Sets the given codecName as the preferred codec by moving it to the beginning
     * of the payload types list (modifies the given mline in place). All instances
     * of the codec are moved up.
     * @param {object} mLine the mline object from an sdp as parsed by transform.parse.
     * @param {string} codecName the name of the preferred codec.
     * @param {boolean} sortPayloadTypes whether the payloadtypes need to be sorted for a given codec.
     */
    preferCodec(mline: any, codecName: string, sortPayloadTypes: boolean = false): void {
        if (!mline || !codecName) {
            return;
        }

        const matchingPayloadTypes = mline.rtp
            .filter((rtp: any) => rtp.codec && rtp.codec.toLowerCase() === codecName.toLowerCase())
            .map((rtp: any) => rtp.payload);

        if (matchingPayloadTypes) {
            if (sortPayloadTypes && codecName === CodecMimeType.H264) {
                // Move all the H.264 codecs with packetization-mode=0 to top of the list.
                const payloadsWithMode0 = matchingPayloadTypes.filter((payload: any) => {
                    const fmtp = mline.fmtp.find((item: any) => item.payload === payload);

                    if (fmtp) {
                        return fmtp.config.includes('packetization-mode=0');
                    }

                    return false;
                });

                for (const pt of payloadsWithMode0.reverse()) {
                    const idx = matchingPayloadTypes.findIndex((payloadType: any) => payloadType === pt);

                    if (idx >= 0) {
                        matchingPayloadTypes.splice(idx, 1);
                        matchingPayloadTypes.unshift(pt);
                    }
                }
            }

            // Call toString() on payloads to get around an issue within SDPTransform that sets
            // payloads as a number, instead of a string, when there is only one payload.
            const payloadTypes
                = mline.payloads
                .toString()
                .split(' ')
                .map((p: string) => parseInt(p, 10));

            for (const pt of matchingPayloadTypes.reverse()) {
                const payloadIndex = payloadTypes.indexOf(pt);

                payloadTypes.splice(payloadIndex, 1);
                payloadTypes.unshift(pt);
            }
            mline.payloads = payloadTypes.join(' ');
        } else {
            logger.error(`No matching RTP payload type found for ${codecName}, failed to set preferred codecs`);
        }
    },

    /**
     * Strips the given codec from the given mline. All related RTX payload
     * types are also stripped. If the resulting mline would have no codecs,
     * it's disabled.
     *
     * @param {object} mLine the mline object from an sdp as parsed by transform.parse.
     * @param {string} codecName the name of the codec which will be stripped.
     * @param {boolean} highProfile determines if only the high profile codec needs to be stripped from the sdp for a
     * given codec type.
     */
    stripCodec(mLine: any, codecName: string, highProfile: boolean = false): void {
        if (!mLine || !codecName) {
            return;
        }

        const highProfileCodecs = new Map<number, string>();
        let removePts: number[] = [];

        for (const rtp of mLine.rtp) {
            if (rtp.codec && rtp.codec.toLowerCase() === codecName.toLowerCase()) {
                if (highProfile) {
                    highProfileCodecs.set(rtp.payload, rtp.codec);
                } else {
                    removePts.push(rtp.payload);
                }
            }
        }

        if (highProfile) {
            removePts = mLine.fmtp
                .filter((item: any) => {
                    const codec = highProfileCodecs.get(item.payload);

                    if (codec) {
                        return codec.toLowerCase() === CodecMimeType.VP9
                            ? !item.config.includes('profile-id=0')
                            : !item.config.includes('profile-level-id=42');
                    }

                    return false;
                })
                .map((item: any) => item.payload);
        }

        if (removePts.length > 0) {
            // We also need to remove the payload types that are related to RTX
            // for the codecs we want to disable.
            const rtxApts = removePts.map(item => `apt=${item}`);
            const rtxPts = mLine.fmtp.filter(
                (item: any) => rtxApts.indexOf(item.config) !== -1);

            removePts.push(...rtxPts.map((item: any) => item.payload));

            // Call toString() on payloads to get around an issue within
            // SDPTransform that sets payloads as a number, instead of a string,
            // when there is only one payload.
            const allPts = mLine.payloads
                .toString()
                .split(' ')
                .map(Number);
            const keepPts = allPts.filter(pt => removePts.indexOf(pt) === -1);

            if (keepPts.length === 0) {
                // There are no other codecs, disable the stream.
                mLine.port = 0;
                mLine.direction = MediaDirection.INACTIVE;
                mLine.payloads = '*';
            } else {
                mLine.payloads = keepPts.join(' ');
            }

            mLine.rtp = mLine.rtp.filter(
                (item: any) => keepPts.indexOf(item.payload) !== -1);
            mLine.fmtp = mLine.fmtp.filter(
                (item: any) => keepPts.indexOf(item.payload) !== -1);
            if (mLine.rtcpFb) {
                mLine.rtcpFb = mLine.rtcpFb.filter(
                    (item: any) => keepPts.indexOf(item.payload) !== -1);
            }
        }
    }
};

export default SDPUtil;
