import {getLogger} from "jitsi-meet-logger";
const logger = getLogger(__filename);
import RandomUtil from "../util/RandomUtil";
var RTCBrowserType = require("../RTC/RTCBrowserType");

var SDPUtil = {
    filter_special_chars: function (text) {
        // XXX Neither one of the falsy values (e.g. null, undefined, false,
        // "", etc.) "contain" special chars.
        return text ? text.replace(/[\\\/\{,\}\+]/g, "") : text;
    },
    iceparams: function (mediadesc, sessiondesc) {
        var data = null;
        var ufrag, pwd;
        if ((ufrag = SDPUtil.find_line(mediadesc, 'a=ice-ufrag:', sessiondesc))
                && (pwd = SDPUtil.find_line(mediadesc, 'a=ice-pwd:', sessiondesc))) {
            data = {
                ufrag: SDPUtil.parse_iceufrag(ufrag),
                pwd: SDPUtil.parse_icepwd(pwd)
            };
        }
        return data;
    },
    parse_iceufrag: function (line) {
        return line.substring(12);
    },
    build_iceufrag: function (frag) {
        return 'a=ice-ufrag:' + frag;
    },
    parse_icepwd: function (line) {
        return line.substring(10);
    },
    build_icepwd: function (pwd) {
        return 'a=ice-pwd:' + pwd;
    },
    parse_mid: function (line) {
        return line.substring(6);
    },
    parse_mline: function (line) {
        var parts = line.substring(2).split(' '),
            data = {};
        data.media = parts.shift();
        data.port = parts.shift();
        data.proto = parts.shift();
        if (parts[parts.length - 1] === '') { // trailing whitespace
            parts.pop();
        }
        data.fmt = parts;
        return data;
    },
    build_mline: function (mline) {
        return 'm=' + mline.media + ' ' + mline.port + ' ' + mline.proto + ' ' + mline.fmt.join(' ');
    },
    parse_rtpmap: function (line) {
        var parts = line.substring(9).split(' '),
            data = {};
        data.id = parts.shift();
        parts = parts[0].split('/');
        data.name = parts.shift();
        data.clockrate = parts.shift();
        data.channels = parts.length ? parts.shift() : '1';
        return data;
    },
    /**
     * Parses SDP line "a=sctpmap:..." and extracts SCTP port from it.
     * @param line eg. "a=sctpmap:5000 webrtc-datachannel"
     * @returns [SCTP port number, protocol, streams]
     */
    parse_sctpmap: function (line)
    {
        var parts = line.substring(10).split(' ');
        var sctpPort = parts[0];
        var protocol = parts[1];
        // Stream count is optional
        var streamCount = parts.length > 2 ? parts[2] : null;
        return [sctpPort, protocol, streamCount];// SCTP port
    },
    build_rtpmap: function (el) {
        var line = 'a=rtpmap:' + el.getAttribute('id') + ' ' + el.getAttribute('name') + '/' + el.getAttribute('clockrate');
        if (el.getAttribute('channels') && el.getAttribute('channels') != '1') {
            line += '/' + el.getAttribute('channels');
        }
        return line;
    },
    parse_crypto: function (line) {
        var parts = line.substring(9).split(' '),
            data = {};
        data.tag = parts.shift();
        data['crypto-suite'] = parts.shift();
        data['key-params'] = parts.shift();
        if (parts.length) {
            data['session-params'] = parts.join(' ');
        }
        return data;
    },
    parse_fingerprint: function (line) { // RFC 4572
        var parts = line.substring(14).split(' '),
            data = {};
        data.hash = parts.shift();
        data.fingerprint = parts.shift();
        // TODO assert that fingerprint satisfies 2UHEX *(":" 2UHEX) ?
        return data;
    },
    parse_fmtp: function (line) {
        var parts = line.split(' '),
            i, key, value,
            data = [];
        parts.shift();
        parts = parts.join(' ').split(';');
        for (i = 0; i < parts.length; i++) {
            key = parts[i].split('=')[0];
            while (key.length && key[0] == ' ') {
                key = key.substring(1);
            }
            value = parts[i].split('=')[1];
            if (key && value) {
                data.push({name: key, value: value});
            } else if (key) {
                // rfc 4733 (DTMF) style stuff
                data.push({name: '', value: key});
            }
        }
        return data;
    },
    parse_icecandidate: function (line) {
        var candidate = {},
            elems = line.split(' ');
        candidate.foundation = elems[0].substring(12);
        candidate.component = elems[1];
        candidate.protocol = elems[2].toLowerCase();
        candidate.priority = elems[3];
        candidate.ip = elems[4];
        candidate.port = elems[5];
        // elems[6] => "typ"
        candidate.type = elems[7];
        candidate.generation = 0; // default value, may be overwritten below
        for (var i = 8; i < elems.length; i += 2) {
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
                    logger.log('parse_icecandidate not translating "' + elems[i] + '" = "' + elems[i + 1] + '"');
            }
        }
        candidate.network = '1';
        candidate.id = Math.random().toString(36).substr(2, 10); // not applicable to SDP -- FIXME: should be unique, not just random
        return candidate;
    },
    build_icecandidate: function (cand) {
        var line = ['a=candidate:' + cand.foundation, cand.component, cand.protocol, cand.priority, cand.ip, cand.port, 'typ', cand.type].join(' ');
        line += ' ';
        switch (cand.type) {
            case 'srflx':
            case 'prflx':
            case 'relay':
                if (cand.hasOwnAttribute('rel-addr') && cand.hasOwnAttribute('rel-port')) {
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
    parse_ssrc: function (desc) {
        // proprietary mapping of a=ssrc lines
        // TODO: see "Jingle RTP Source Description" by Juberti and P. Thatcher on google docs
        // and parse according to that
        var lines = desc.split('\r\n'),
            data = {};
        for (var i = 0; i < lines.length; i++) {
            if (lines[i].substring(0, 7) == 'a=ssrc:') {
                var idx = lines[i].indexOf(' ');
                data[lines[i].substr(idx + 1).split(':', 2)[0]] = lines[i].substr(idx + 1).split(':', 2)[1];
            }
        }
        return data;
    },
    parse_rtcpfb: function (line) {
        var parts = line.substr(10).split(' ');
        var data = {};
        data.pt = parts.shift();
        data.type = parts.shift();
        data.params = parts;
        return data;
    },
    parse_extmap: function (line) {
        var parts = line.substr(9).split(' ');
        var data = {};
        data.value = parts.shift();
        if (data.value.indexOf('/') != -1) {
            data.direction = data.value.substr(data.value.indexOf('/') + 1);
            data.value = data.value.substr(0, data.value.indexOf('/'));
        } else {
            data.direction = 'both';
        }
        data.uri = parts.shift();
        data.params = parts;
        return data;
    },
    find_line: function (haystack, needle, sessionpart) {
        var lines = haystack.split('\r\n');
        for (var i = 0; i < lines.length; i++) {
            if (lines[i].substring(0, needle.length) == needle) {
                return lines[i];
            }
        }
        if (!sessionpart) {
            return false;
        }
        // search session part
        lines = sessionpart.split('\r\n');
        for (var j = 0; j < lines.length; j++) {
            if (lines[j].substring(0, needle.length) == needle) {
                return lines[j];
            }
        }
        return false;
    },
    find_lines: function (haystack, needle, sessionpart) {
        var lines = haystack.split('\r\n'),
            needles = [];
        for (var i = 0; i < lines.length; i++) {
            if (lines[i].substring(0, needle.length) == needle)
                needles.push(lines[i]);
        }
        if (needles.length || !sessionpart) {
            return needles;
        }
        // search session part
        lines = sessionpart.split('\r\n');
        for (var j = 0; j < lines.length; j++) {
            if (lines[j].substring(0, needle.length) == needle) {
                needles.push(lines[j]);
            }
        }
        return needles;
    },
    candidateToJingle: function (line) {
        // a=candidate:2979166662 1 udp 2113937151 192.168.2.100 57698 typ host generation 0
        //      <candidate component=... foundation=... generation=... id=... ip=... network=... port=... priority=... protocol=... type=.../>
        if (line.indexOf('candidate:') === 0) {
            line = 'a=' + line;
        } else if (line.substring(0, 12) != 'a=candidate:') {
            logger.log('parseCandidate called with a line that is not a candidate line');
            logger.log(line);
            return null;
        }
        if (line.substring(line.length - 2) == '\r\n') // chomp it
            line = line.substring(0, line.length - 2);
        var candidate = {},
            elems = line.split(' '),
            i;
        if (elems[6] != 'typ') {
            logger.log('did not find typ in the right place');
            logger.log(line);
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
        for (i = 8; i < elems.length; i += 2) {
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
                    logger.log('not translating "' + elems[i] + '" = "' + elems[i + 1] + '"');
            }
        }
        candidate.network = '1';
        candidate.id = Math.random().toString(36).substr(2, 10); // not applicable to SDP -- FIXME: should be unique, not just random
        return candidate;
    },
    candidateFromJingle: function (cand) {
        var line = 'a=candidate:';
        line += cand.getAttribute('foundation');
        line += ' ';
        line += cand.getAttribute('component');
        line += ' ';

        var protocol = cand.getAttribute('protocol');
        // use tcp candidates for FF
        if (RTCBrowserType.isFirefox() && protocol.toLowerCase() == 'ssltcp') {
            protocol = 'tcp';
        }

        line += protocol; //.toUpperCase(); // chrome M23 doesn't like this
        line += ' ';
        line += cand.getAttribute('priority');
        line += ' ';
        line += cand.getAttribute('ip');
        line += ' ';
        line += cand.getAttribute('port');
        line += ' ';
        line += 'typ';
        line += ' ' + cand.getAttribute('type');
        line += ' ';
        switch (cand.getAttribute('type')) {
            case 'srflx':
            case 'prflx':
            case 'relay':
                if (cand.getAttribute('rel-addr') && cand.getAttribute('rel-port')) {
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
        if (protocol.toLowerCase() == 'tcp') {
            line += 'tcptype';
            line += ' ';
            line += cand.getAttribute('tcptype');
            line += ' ';
        }
        line += 'generation';
        line += ' ';
        line += cand.getAttribute('generation') || '0';
        return line + '\r\n';
    },

    /**
     * Parse the 'most' primary video ssrc from the given m line
     * @param {object} mLine object as parsed from transform.parse
     * @return {number} the primary video ssrc from the given m line
     */
    parsePrimaryVideoSsrc: function(videoMLine) {
        let numSsrcs = videoMLine.ssrcs
            .map(ssrcInfo => ssrcInfo.id)
            .filter((ssrc, index, array) => array.indexOf(ssrc) === index)
            .length;
        let numGroups = (videoMLine.ssrcGroups && videoMLine.ssrcGroups.length) || 0;
        if (numSsrcs > 1 && numGroups === 0) {
            // Ambiguous, can't figure out the primary
            return;
        }
        let primarySsrc = null;
        if (numSsrcs === 1) {
            primarySsrc = videoMLine.ssrcs[0].id;
        } else {
            if (numSsrcs === 2) {
                // Can figure it out if there's an FID group
                let fidGroup = videoMLine.ssrcGroups
                    .find(group => group.semantics === "FID");
                if (fidGroup) {
                    primarySsrc = fidGroup.ssrcs.split(" ")[0];
                }
            } else if (numSsrcs >= 3) {
                // Can figure it out if there's a sim group
                let simGroup = videoMLine.ssrcGroups
                    .find(group => group.semantics === "SIM");
                if (simGroup) {
                    primarySsrc = simGroup.ssrcs.split(" ")[0];
                }
            }
        }
        return primarySsrc;
    },

    /**
     * Generate an ssrc
     * @returns {number} an ssrc
     */
    generateSsrc: function() {
        return RandomUtil.randomInt(1, 0xffffffff);
    },

    /**
     * Get an attribute for the given ssrc with the given attributeName
     *  from the given mline
     * @param {object} mLine an mLine object as parsed from transform.parse
     * @param {number} ssrc the ssrc for which an attribtue is desired
     * @param {string} attributeName the name of the desired attribute
     * @returns {string} the value corresponding to the given ssrc
     *  and attributeName
     */
    getSsrcAttribute: function (mLine, ssrc, attributeName) {
        for (let i = 0; i < mLine.ssrcs.length; ++i) {
            let ssrcLine = mLine.ssrcs[i];
            if (ssrcLine.id === ssrc &&
                ssrcLine.attribute === attributeName) {
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
    parseGroupSsrcs: function (ssrcGroup) {
        return ssrcGroup
            .ssrcs
            .split(" ")
            .map(ssrcStr => parseInt(ssrcStr));
    },

    /**
     * Get the mline of the given type from the given sdp
     * @param {object} sdp sdp as parsed from transform.parse
     * @param {string} type the type of the desired mline (e.g. "video")
     * @returns {object} a media object
     */
    getMedia: function (sdp, type) {
        return sdp.media.find(m => m.type === type);
    },
    /**
     * Sets the given codecName as the preferred codec by
     *  moving it to the beginning of the payload types
     *  list (modifies the given mline in place).  If there
     *  are multiple options within the same codec (multiple h264
     *  profiles, for instance), this will prefer the first one
     *  that is found.
     * @param {object} videoMLine the video mline object from
     *  an sdp as parsed by transform.parse
     * @param {string} the name of the preferred codec
     */
    preferVideoCodec: function(videoMLine, codecName) {
        let payloadType = null;
        for (let i = 0; i < videoMLine.rtp.length; ++i) {
          const rtp = videoMLine.rtp[i];
          if (rtp.codec === codecName) {
              payloadType = rtp.payload;
              break;
          }
        }
        if (payloadType) {
            const payloadTypes = videoMLine.payloads.split(" ").map(p => parseInt(p));
            const payloadIndex = payloadTypes.indexOf(payloadType);
            payloadTypes.splice(payloadIndex, 1);
            payloadTypes.unshift(payloadType);
            videoMLine.payloads = payloadTypes.join(" ");
        }
    },
};

module.exports = SDPUtil;
