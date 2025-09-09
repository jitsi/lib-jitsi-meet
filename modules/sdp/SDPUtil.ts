import { getLogger } from '@jitsi/logger';
import type { MediaDescription } from 'sdp-transform';

import { CodecMimeType } from '../../service/RTC/CodecMimeType';
import { MediaDirection } from '../../service/RTC/MediaDirection';
import { SSRC_GROUP_SEMANTICS } from '../../service/RTC/StandardVideoQualitySettings';
import browser from '../browser';
import RandomUtil from '../util/RandomUtil';

import { ICryptoData, IExtmapData, IFingerprintData, IFmtpParameter, IICECandidate, IICEParams, IMediaLine, IRTCPFBData, IRTPMapData, ISSRCGroupData } from './constants';

const logger = getLogger('sdp:SDPUtils');

const SDPUtil = {
    /**
     * Builds an ICE candidate line for SDP.
     *
     * @param {IICECandidate} cand - The ICE candidate object.
     * @returns {string} - The SDP line for the ICE candidate.
     */
    buildICECandidate(cand: IICECandidate): string {
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
            if (cand.hasOwnAttribute('rel-addr')
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
        if (cand.hasOwnAttribute('tcptype')) {
            line += 'tcptype';
            line += ' ';
            line += cand.tcptype;
            line += ' ';
        }
        line += 'generation';
        line += ' ';
        line += cand.hasOwnAttribute('generation') ? cand.generation : '0';

        return line;
    },

    /**
     * Builds an ICE password line for SDP.
     *
     * @param {string} pwd - The ICE password.
     * @returns {string} - The SDP line for the ICE password.
     */
    buildICEPwd(pwd: string): string {
        return `a=ice-pwd:${pwd}`;
    },

    /**
     * Builds an ICE ufrag line for SDP.
     *
     * @param {string} frag - The ICE ufrag.
     * @returns {string} - The SDP line for the ICE ufrag.
     */
    buildICEUfrag(frag: string): string {
        return `a=ice-ufrag:${frag}`;
    },

    /**
     * Builds an SDP media line.
     *
     * @param {IMediaLine} mline - The media line object.
     * @returns {string} - The SDP media line.
     */
    buildMLine(mline: IMediaLine): string {
        return (
            `m=${mline.media} ${mline.port} ${mline.proto} ${
                mline.fmt.join(' ')}`);
    },

    /**
     * Builds an RTP map line for SDP.
     *
     * @param {Element} el - The RTP map element.
     * @returns {String} - The SDP line for the RTP map.
     */
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

    /**
     * Builds an ICE candidate line for SDP.
     *
     * @param {Element} cand - The ICE candidate object.
     * @returns {string} - The SDP line for the ICE candidate.
     */
    candidateFromJingle(cand: Element): string {
        let line = 'a=candidate:';

        line += cand.getAttribute('foundation');
        line += ' ';
        line += cand.getAttribute('component');
        line += ' ';

        let protocol = cand.getAttribute('protocol');

        // use tcp candidates for FF

        if (browser.isFirefox() && protocol.toLowerCase() === 'ssltcp') {
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
        if (protocol.toLowerCase() === 'tcp') {
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
     * Builds an ICE candidate from SDP.
     *
     * @param {string} line - The SDP line for the ICE candidate.
     * @returns {Nullable<IICECandidate>} - The Jingle XML representation of the ICE candidate.
     */
    candidateToJingle(line: string): Nullable<IICECandidate> {
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
        const candidate: Partial<IICECandidate> = {};
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

        return candidate as IICECandidate;
    },

    filterSpecialChars(text: Nullable<Optional<string>>): Nullable<Optional<string>> {
        // XXX Neither one of the falsy values (e.g. null, undefined, false,
        // "", etc.) "contain" special chars.
        // eslint-disable-next-line no-useless-escape
        return text ? text.replace(/[\\\/\{,\}\+]/g, '') : text;
    },

    /**
     * Finds a line in the SDP that starts with the given search pattern.
     *
     * @param {string} haystack - The SDP string to search.
     * @param {string} needle - The line prefix to find.
     * @param {string} sessionpart - The session part to search within.
     * @returns {Optional<string>} - The found line or false if not found.
     */
    findLine(haystack: string, needle: string, sessionpart?: string): Optional<string> {
        let lines = haystack.split('\r\n');

        for (let i = 0; i < lines.length; i++) {
            if (lines[i].substring(0, needle.length) === needle) {
                return lines[i];
            }
        }
        if (!sessionpart) {
            return undefined;
        }

        // search session part
        lines = sessionpart.split('\r\n');
        for (let j = 0; j < lines.length; j++) {
            if (lines[j].substring(0, needle.length) === needle) {
                return lines[j];
            }
        }

        return undefined;
    },

    /**
     * Finds all lines in the SDP that start with the given search pattern.
     *
     * @param {string} haystack - The SDP string to search.
     * @param {string} needle - The line prefix to find.
     * @param {string} sessionpart - The session part to search within.
     * @returns {string[]} - An array of found lines.
     */
    findLines(haystack: string, needle: string, sessionpart?: string): string[] {
        let lines = haystack.split('\r\n');
        const needles = [];

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

    /**
     * Generates a random SSRC value.
     *
     * @returns {number} - A random SSRC value.
     */
    generateSsrc(): number {
        return RandomUtil.randomInt(1, 0xffffffff);
    },

    /**
     * Gets the SSRC attribute value from the media line.
     *
     * @param {MediaDescription} mLine - The media line object.
     * @param {number} ssrc - The SSRC value to search for.
     * @param {string} attributeName - The attribute name to search for.
     * @returns {string|null} - The attribute value or null if not found.
     */
    getSsrcAttribute(mLine: MediaDescription, ssrc: number, attributeName: string): Nullable<string> {
        for (let i = 0; i < mLine.ssrcs.length; ++i) {
            const ssrcLine = mLine.ssrcs[i];

            if (ssrcLine.id === ssrc
                && ssrcLine.attribute === attributeName) {
                return ssrcLine.value;
            }
        }
    },

    /**
     * Gets the ICE ufrag from the SDP.
     *
     * @param {string} sdp - The SDP string to search.
     * @returns {Optional<string>} - The ICE ufrag value or undefined if not found.
     */
    getUfrag(sdp: string): Optional<string> {
        const ufragLines
            = sdp.split('\n').filter(line => line.startsWith('a=ice-ufrag:'));

        if (ufragLines.length > 0) {
            return ufragLines[0].substr('a=ice-ufrag:'.length);
        }
    },

    /**
     * Gets the ICE parameters from the media description and session description.
     *
     * @param {string} mediadesc - The media description string.
     * @param {string} sessiondesc - The session description string.
     * @returns {Nullable<IICEParams>} - The ICE parameters object or null if not found.
     */
    iceparams(mediadesc: string, sessiondesc: string): Nullable<IICEParams> {
        let data = null;
        let pwd, ufrag;

        if ((ufrag = SDPUtil.findLine(mediadesc, 'a=ice-ufrag:', sessiondesc))
                && (pwd
                    = SDPUtil.findLine(
                        mediadesc,
                        'a=ice-pwd:',
                        sessiondesc))) {
            data = {
                pwd: SDPUtil.parseICEPwd(pwd),
                ufrag: SDPUtil.parseICEUfrag(ufrag)
            };
        }

        return data;
    },

    /**
     * Parses a crypto line from the SDP.
     *
     * @param {string} line - The crypto line to parse.
     * @returns {ICryptoData} - The parsed crypto parameters.
     */
    parseCrypto(line: string): ICryptoData {
        const data: Partial<ICryptoData> = {};
        const parts = line.substring(9).split(' ');

        data.tag = parts.shift();
        data['crypto-suite'] = parts.shift();
        data['key-params'] = parts.shift();
        if (parts.length) {
            data['session-params'] = parts.join(' ');
        }

        return data as ICryptoData;
    },

    /**
     * Parses an extmap line from the SDP.
     *
     * @param {string} line - The extmap line to parse.
     * @returns {IExtmapData} - The parsed extmap parameters.
     */
    parseExtmap(line: string): IExtmapData {
        const parts = line.substr(9).split(' ');
        const data: Partial<IExtmapData> = {};

        data.value = parts.shift();
        if (data.value.indexOf('/') === -1) {
            data.direction = 'both';
        } else {
            data.direction = data.value.substr(data.value.indexOf('/') + 1);
            data.value = data.value.substr(0, data.value.indexOf('/'));
        }
        data.uri = parts.shift();
        data.params = parts;

        return data as IExtmapData;
    },

    /**
     * Parses a fingerprint line from the SDP.
     *
     * @param {string} line - The fingerprint line to parse.
     * @returns {IFingerprintData} - The parsed fingerprint parameters.
     */
    parseFingerprint(line: string): IFingerprintData { // RFC 4572
        const data: Partial<IFingerprintData> = {};
        const parts = line.substring(14).split(' ');

        data.hash = parts.shift();
        data.fingerprint = parts.shift();

        // TODO assert that fingerprint satisfies 2UHEX *(":" 2UHEX) ?
        return data as IFingerprintData;
    },

    /**
     * Parses a fmtp line from the SDP.
     *
     * @param {string} line - The fmtp line to parse.
     * @returns {IFmtpParameter[]} - The parsed fmtp parameters.
     */
    parseFmtp(line: string): IFmtpParameter[] {
        const data = [];
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

    /**
     * Parses the SSRCs from a group description.
     *
     * @param {MediaDescription['ssrcGroups'][number]} ssrcGroup - The SSRC group object.
     * @returns {number[]} - The list of SSRCs in the group.
     */
    parseGroupSsrcs(ssrcGroup: MediaDescription['ssrcGroups'][number]): number[] {
        return ssrcGroup
            .ssrcs
            .split(' ')
            .map(ssrcStr => parseInt(ssrcStr, 10));
    },

    /**
     * Parses an ICE candidate line from the SDP.
     *
     * @param {string} line - The ICE candidate line to parse.
     * @returns {IICECandidate} - The parsed ICE candidate parameters.
     */
    parseICECandidate(line: string): IICECandidate {
        const candidate: Partial<IICECandidate> = {};
        const elems = line.split(' ');

        candidate.foundation = elems[0].substring(12);
        candidate.component = elems[1];
        candidate.protocol = elems[2].toLowerCase();
        candidate.priority = elems[3];
        candidate.ip = elems[4];
        candidate.port = elems[5];

        // elems[6] => "typ"
        candidate.type = elems[7];
        candidate.generation = '0'; // default value, may be overwritten below
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

        return candidate as IICECandidate;
    },

    /**
     * Parses an ICE password line from the SDP.
     *
     * @param {string} line - The ICE password line to parse.
     * @returns {string} - The parsed ICE password.
     */
    parseICEPwd(line: string): string {
        return line.substring(10);
    },

    /**
     * Parses an ICE ufrag line from the SDP.
     *
     * @param {string} line - The ICE ufrag line to parse.
     * @returns {string} - The parsed ICE ufrag.
     */
    parseICEUfrag(line: string): string {
        return line.substring(12);
    },

    /**
     * Parses a media ID line from the SDP.
     *
     * @param {string} line - The media ID line to parse.
     * @returns {string} - The parsed media ID.
     */
    parseMID(line: string): string {
        return line.substring(6);
    },

    /**
     * Parses a media line from the SDP.
     *
     * @param {string} line - The media line to parse.
     * @returns {IMediaLine} - The parsed media line data.
     */
    parseMLine(line: string): IMediaLine {
        const data: Partial<IMediaLine> = {};
        const parts = line.substring(2).split(' ');

        data.media = parts.shift();
        data.port = parts.shift();
        data.proto = parts.shift();
        if (parts[parts.length - 1] === '') { // trailing whitespace
            parts.pop();
        }
        data.fmt = parts;

        return data as IMediaLine;
    },

    /**
     * Parses the MSID attribute from the given SSRC lines.
     *
     * @param {string[]} ssrcLines - The SSRC lines to search.
     * @returns {Optional<string>} - The parsed MSID or undefined if not found.
     */
    parseMSIDAttribute(ssrcLines: string[]): Optional<string> {
        const msidLine = ssrcLines.find(line => line.indexOf(' msid:') > 0);

        if (!msidLine) {
            return undefined;
        }

        const v = msidLine.substring(msidLine.indexOf(' msid:') + 6 /* the length of ' msid:' */);

        return SDPUtil.filterSpecialChars(v);
    },

    /**
     * Parse the 'most' primary video ssrc from the given m line
     * @param {MediaDescription} videoMLine object as parsed from transform.parse
     * @return {Optional<number>} the primary video ssrc from the given m line
     */
    parsePrimaryVideoSsrc(videoMLine: MediaDescription): Optional<number> {
        const numSsrcs = (videoMLine.ssrcs)
            .map(ssrcInfo => ssrcInfo.id)
            .filter((ssrc, index, array) => array.indexOf(ssrc) === index)
            .length;
        const numGroups
            = (videoMLine?.ssrcGroups?.length) || 0;

        if (numSsrcs > 1 && numGroups === 0) {
            // Ambiguous, can't figure out the primary
            return;
        }
        let primarySsrc: Nullable<number> = null;

        if (numSsrcs === 1) {
            primarySsrc = videoMLine.ssrcs[0].id;
        } else if (numSsrcs === 2) {
            // Can figure it out if there's an FID group
            const fidGroup
                = videoMLine.ssrcGroups.find(
                    group => group.semantics === SSRC_GROUP_SEMANTICS.FID);

            if (fidGroup) {
                primarySsrc = parseInt(fidGroup.ssrcs.split(' ')[0], 10);
            }
        } else if (numSsrcs >= 3) {
            // Can figure it out if there's a sim group
            const simGroup
                = videoMLine.ssrcGroups.find(
                    group => group.semantics === SSRC_GROUP_SEMANTICS.SIM);

            if (simGroup) {
                primarySsrc = parseInt(simGroup.ssrcs.split(' ')[0], 10);
            }
        }

        return primarySsrc;
    },

    /**
     * Parses an RTCP feedback line from the SDP.
     *
     * @param {string} line - The RTCP feedback line to parse.
     * @returns {IRTCPFBData} - The parsed RTCP feedback data.
     */
    parseRTCPFB(line: string): IRTCPFBData {
        const parts = line.substr(10).split(' ');
        const data: Partial<IRTCPFBData> = {};

        data.pt = parts.shift();
        data.type = parts.shift();
        data.params = parts;

        return data as IRTCPFBData;
    },

    /**
     * Parses an RTP map line from the SDP.
     *
     * @param {string} line - The RTP map line to parse.
     * @returns {IRTPMapData} - The parsed RTP map data.
     */
    parseRTPMap(line: string): IRTPMapData {
        const data: Partial<IRTPMapData> = {};
        let parts = line.substring(9).split(' ');

        data.id = parts.shift();
        parts = parts[0].split('/');
        data.name = parts.shift();
        data.clockrate = parts.shift();
        data.channels = parts.length ? parts.shift() : '1';

        return data as IRTPMapData;
    },

    /**
     * Parses SDP line "a=sctpmap:..." and extracts SCTP port from it.
     *
     * @param {string} line eg. "a=sctpmap:5000 webrtc-datachannel"
     * @returns {[string, string, Nullable<string>]} [SCTP port number, protocol, streams]
     */
    parseSCTPMap(line: string): [string, string, Nullable<string>] {
        const parts = line.substring(10).split(' ');
        const sctpPort = parts[0];
        const protocol = parts[1];

        // Stream count is optional
        const streamCount = parts.length > 2 ? parts[2] : null;


        return [ sctpPort, protocol, streamCount ];// SCTP port
    },

    /**
     * Parses the SCTP port line from the SDP.
     *
     * @param {string} line - The SCTP port line to parse.
     * @returns {string} - The parsed SCTP port.
     */
    parseSCTPPort(line: string): string {
        return line.substring(12);
    },

    /**
     * Parses the SSRC lines from the SDP.
     *
     * @param {string} desc - The SDP description to parse.
     * @returns {Map<string, string[]>} - A map of SSRCs to their corresponding lines.
     */
    parseSSRC(desc: string): Map<string, string[]> {
        // proprietary mapping of a=ssrc lines
        // TODO: see "Jingle RTP Source Description" by Juberti and P. Thatcher
        // on google docs and parse according to that
        const data = new Map();
        const lines = desc.split('\r\n');

        for (let i = 0; i < lines.length; i++) {
            if (lines[i].substring(0, 7) === 'a=ssrc:') {
                // FIXME: Use regex to smartly find the ssrc.
                const ssrc = lines[i].split('a=ssrc:')[1].split(' ')[0];

                if (!data.get(ssrc)) {
                    data.set(ssrc, []);
                }

                data.get(ssrc).push(lines[i]);
            }
        }

        return data;
    },

    /**
     * Parses the 'a=ssrc-group' line.
     *
     * @param {string} line - The media line to parse.
     * @returns {ISSRCGroupData}
     */
    parseSSRCGroupLine(line: string): ISSRCGroupData {
        const parts = line.substr(13).split(' ');

        return {
            semantics: parts.shift(),
            ssrcs: parts
        };
    },

    /**
     * Gets the source name out of the name attribute "a=ssrc:254321 name:name1".
     *
     * @param {string[]} ssrcLines
     * @returns {Optional<string>}
     */
    parseSourceNameLine(ssrcLines: string[]): Optional<string> {
        const sourceNameLine = ssrcLines.find(ssrcSdpLine => ssrcSdpLine.indexOf(' name:') > 0);

        // Everything past the "name:" part
        return sourceNameLine?.substring(sourceNameLine.indexOf(' name:') + 6);
    },

    /**
     * Parse the "videoType" attribute encoded in a set of SSRC attributes (e.g.
     * "a=ssrc:1234 videoType:desktop")
     *
     * @param {string[]} ssrcLines
     * @returns {Optional<string>}
     */
    parseVideoTypeLine(ssrcLines: string[]): Optional<string> {
        const s = ' videoType:';
        const videoTypeLine = ssrcLines.find(ssrcSdpLine => ssrcSdpLine.indexOf(s) > 0);

        return videoTypeLine?.substring(videoTypeLine.indexOf(s) + s.length);
    },

    /**
     * Sets the given codecName as the preferred codec by moving it to the beginning
     * of the payload types list (modifies the given mline in place). All instances
     * of the codec are moved up.
     * @param {MediaDescription} mLine the mline object from an sdp as parsed by transform.parse.
     * @param {string} codecName the name of the preferred codec.
     * @param {boolean} sortPayloadTypes whether the payloadtypes need to be sorted for a given codec.
     */
    preferCodec(mline: MediaDescription, codecName: string, sortPayloadTypes: boolean = false): void {
        if (!mline || !codecName) {
            return;
        }

        const matchingPayloadTypes = mline.rtp
            .filter(rtp => rtp.codec && rtp.codec.toLowerCase() === codecName.toLowerCase())
            .map(rtp => rtp.payload);

        if (matchingPayloadTypes) {
            if (sortPayloadTypes && codecName === CodecMimeType.H264) {
                // Move all the H.264 codecs with packetization-mode=0 to top of the list.
                const payloadsWithMode0 = matchingPayloadTypes.filter(payload => {
                    const fmtp = mline.fmtp.find(item => item.payload === payload);

                    if (fmtp) {
                        return fmtp.config.includes('packetization-mode=0');
                    }

                    return false;
                });

                for (const pt of payloadsWithMode0.reverse()) {
                    const idx = matchingPayloadTypes.findIndex(payloadType => payloadType === pt);

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
                .map(p => parseInt(p, 10));

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
     * @param {MediaDescription} mLine the mline object from an sdp as parsed by transform.parse.
     * @param {string} codecName the name of the codec which will be stripped.
     * @param {boolean} highProfile determines if only the high profile codec needs to be stripped from the sdp for a
     * given codec type.
     */
    stripCodec(mLine: MediaDescription, codecName: string, highProfile: boolean = false): void {
        if (!mLine || !codecName) {
            return;
        }

        const highProfileCodecs = new Map();
        let removePts = [];

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
                .filter(item => {
                    const codec = highProfileCodecs.get(item.payload);

                    if (codec) {
                        return codec.toLowerCase() === CodecMimeType.VP9
                            ? !item.config.includes('profile-id=0')
                            : !item.config.includes('profile-level-id=42');
                    }

                    return false;
                })
                .map(item => item.payload);
        }

        if (removePts.length > 0) {
            // We also need to remove the payload types that are related to RTX
            // for the codecs we want to disable.
            const rtxApts = removePts.map(item => `apt=${item}`);
            const rtxPts = mLine.fmtp.filter(
                item => rtxApts.indexOf(item.config) !== -1);

            removePts.push(...rtxPts.map(item => item.payload));

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
                item => keepPts.indexOf(item.payload) !== -1);
            mLine.fmtp = mLine.fmtp.filter(
                item => keepPts.indexOf(item.payload) !== -1);
            if (mLine.rtcpFb) {
                mLine.rtcpFb = mLine.rtcpFb.filter(
                    item => keepPts.indexOf(Number(item.payload)) !== -1);
            }
        }
    }
};

export default SDPUtil;
