/* global $ */

import MediaDirection from '../../service/RTC/MediaDirection';
import browser from '../browser';

import SDPUtil from './SDPUtil';

/**
 *
 * @param sdp
 */
export default function SDP(sdp) {
    const media = sdp.split('\r\nm=');

    for (let i = 1, length = media.length; i < length; i++) {
        let mediaI = `m=${media[i]}`;

        if (i !== length - 1) {
            mediaI += '\r\n';
        }
        media[i] = mediaI;
    }
    const session = `${media.shift()}\r\n`;

    this.media = media;
    this.raw = session + media.join('');
    this.session = session;
}

/**
 * A flag will make {@link transportToJingle} and {@link jingle2media} replace
 * ICE candidates IPs with invalid value of '1.1.1.1' which will cause ICE
 * failure. The flag is used in the automated testing.
 * @type {boolean}
 */
SDP.prototype.failICE = false;

/**
 * Whether or not to remove TCP ice candidates when translating from/to jingle.
 * @type {boolean}
 */
SDP.prototype.removeTcpCandidates = false;

/**
 * Whether or not to remove UDP ice candidates when translating from/to jingle.
 * @type {boolean}
 */
SDP.prototype.removeUdpCandidates = false;

/**
 * Returns map of MediaChannel mapped per channel idx.
 */
SDP.prototype.getMediaSsrcMap = function() {
    const mediaSSRCs = {};

    for (let mediaindex = 0; mediaindex < this.media.length; mediaindex++) {
        const mid
            = SDPUtil.parseMID(
                SDPUtil.findLine(this.media[mediaindex], 'a=mid:'));
        const media = {
            mediaindex,
            mid,
            ssrcs: {},
            ssrcGroups: []
        };

        mediaSSRCs[mediaindex] = media;

        SDPUtil.findLines(this.media[mediaindex], 'a=ssrc:').forEach(line => {
            const linessrc = line.substring(7).split(' ')[0];

            // allocate new ChannelSsrc

            if (!media.ssrcs[linessrc]) {
                media.ssrcs[linessrc] = {
                    ssrc: linessrc,
                    lines: []
                };
            }
            media.ssrcs[linessrc].lines.push(line);
        });
        SDPUtil.findLines(this.media[mediaindex], 'a=ssrc-group:').forEach(line => {
            const idx = line.indexOf(' ');
            const semantics = line.substr(0, idx).substr(13);
            const ssrcs = line.substr(14 + semantics.length).split(' ');

            if (ssrcs.length) {
                media.ssrcGroups.push({
                    semantics,
                    ssrcs
                });
            }
        });
    }

    return mediaSSRCs;
};

/**
 * Returns <tt>true</tt> if this SDP contains given SSRC.
 * @param ssrc the ssrc to check.
 * @returns {boolean} <tt>true</tt> if this SDP contains given SSRC.
 */
SDP.prototype.containsSSRC = function(ssrc) {
    // FIXME this code is really strange - improve it if you can
    const medias = this.getMediaSsrcMap();
    let result = false;

    Object.keys(medias).forEach(mediaindex => {
        if (result) {
            return;
        }
        if (medias[mediaindex].ssrcs[ssrc]) {
            result = true;
        }
    });

    return result;
};

// add content's to a jingle element
SDP.prototype.toJingle = function(elem, thecreator) {
    // https://xmpp.org/extensions/xep-0338.html
    SDPUtil.findLines(this.session, 'a=group:').forEach(line => {
        const parts = line.split(' ');
        const semantics = parts.shift().substr(8);

        elem.c('group', { xmlns: 'urn:xmpp:jingle:apps:grouping:0',
            semantics });
        for (let j = 0; j < parts.length; j++) {
            elem.c('content', { name: parts[j] }).up();
        }
        elem.up();
    });

    for (let i = 0; i < this.media.length; i++) {
        const mline = SDPUtil.parseMLine(this.media[i].split('\r\n')[0]);

        if (!(mline.media === 'audio'
              || mline.media === 'video'
              || mline.media === 'application')) {
            continue; // eslint-disable-line no-continue
        }

        let ssrc;
        const assrcline = SDPUtil.findLine(this.media[i], 'a=ssrc:');

        if (assrcline) {
            ssrc = assrcline.substring(7).split(' ')[0]; // take the first
        } else {
            ssrc = false;
        }

        elem.c('content', { creator: thecreator,
            name: mline.media });
        const amidline = SDPUtil.findLine(this.media[i], 'a=mid:');

        if (amidline) {
            // prefer identifier from a=mid if present
            const mid = SDPUtil.parseMID(amidline);

            elem.attrs({ name: mid });
        }

        if (mline.media === 'audio' || mline.media === 'video') {
            elem.c('description',
                { xmlns: 'urn:xmpp:jingle:apps:rtp:1',
                    media: mline.media });
            if (ssrc) {
                elem.attrs({ ssrc });
            }
            for (let j = 0; j < mline.fmt.length; j++) {
                const rtpmap
                    = SDPUtil.findLine(
                        this.media[i],
                        `a=rtpmap:${mline.fmt[j]}`);

                elem.c('payload-type', SDPUtil.parseRTPMap(rtpmap));

                // put any 'a=fmtp:' + mline.fmt[j] lines into <param name=foo
                // value=bar/>
                const afmtpline
                    = SDPUtil.findLine(
                        this.media[i],
                        `a=fmtp:${mline.fmt[j]}`);

                if (afmtpline) {
                    const fmtpParameters = SDPUtil.parseFmtp(afmtpline);

                    // eslint-disable-next-line max-depth
                    for (let k = 0; k < fmtpParameters.length; k++) {
                        elem.c('parameter', fmtpParameters[k]).up();
                    }
                }

                // XEP-0293 -- map a=rtcp-fb
                this.rtcpFbToJingle(i, elem, mline.fmt[j]);

                elem.up();
            }

            if (ssrc) {
                const ssrcMap = SDPUtil.parseSSRC(this.media[i]);

                for (const [ availableSsrc, ssrcParameters ] of ssrcMap) {
                    elem.c('source', {
                        ssrc: availableSsrc,
                        xmlns: 'urn:xmpp:jingle:apps:rtp:ssma:0'
                    });

                    ssrcParameters.forEach(ssrcSdpLine => {
                        // get everything after first space
                        const idx = ssrcSdpLine.indexOf(' ');
                        const kv = ssrcSdpLine.substr(idx + 1);

                        elem.c('parameter');
                        if (kv.indexOf(':') === -1) {
                            elem.attrs({ name: kv });
                        } else {
                            const name = kv.split(':', 2)[0];

                            elem.attrs({ name });

                            let v = kv.split(':', 2)[1];

                            v = SDPUtil.filterSpecialChars(v);
                            elem.attrs({ value: v });
                        }
                        elem.up();
                    });

                    elem.up();
                }

                // XEP-0339 handle ssrc-group attributes
                const ssrcGroupLines
                    = SDPUtil.findLines(this.media[i], 'a=ssrc-group:');

                ssrcGroupLines.forEach(line => {
                    const idx = line.indexOf(' ');
                    const semantics = line.substr(0, idx).substr(13);
                    const ssrcs = line.substr(14 + semantics.length).split(' ');

                    if (ssrcs.length) {
                        elem.c('ssrc-group', { semantics,
                            xmlns: 'urn:xmpp:jingle:apps:rtp:ssma:0' });
                        ssrcs.forEach(s => elem.c('source', { ssrc: s }).up());
                        elem.up();
                    }
                });
            }

            const ridLines = SDPUtil.findLines(this.media[i], 'a=rid:');

            if (ridLines.length && browser.usesRidsForSimulcast()) {
                // Map a line which looks like "a=rid:2 send" to just
                // the rid ("2")
                const rids = ridLines
                    .map(ridLine => ridLine.split(':')[1])
                    .map(ridInfo => ridInfo.split(' ')[0]);

                rids.forEach(rid => {
                    elem.c('source', {
                        rid,
                        xmlns: 'urn:xmpp:jingle:apps:rtp:ssma:0'
                    });
                    elem.up();
                });
                const unifiedSimulcast
                    = SDPUtil.findLine(this.media[i], 'a=simulcast:');

                if (unifiedSimulcast) {
                    elem.c('rid-group', {
                        semantics: 'SIM',
                        xmlns: 'urn:xmpp:jingle:apps:rtp:ssma:0'
                    });
                    rids.forEach(rid => {
                        elem.c('source', { rid }).up();
                    });
                    elem.up();
                }
            }

            if (SDPUtil.findLine(this.media[i], 'a=rtcp-mux')) {
                elem.c('rtcp-mux').up();
            }

            // XEP-0293 -- map a=rtcp-fb:*
            this.rtcpFbToJingle(i, elem, '*');

            // XEP-0294
            const extmapLines = SDPUtil.findLines(this.media[i], 'a=extmap:');

            for (let j = 0; j < extmapLines.length; j++) {
                const extmap = SDPUtil.parseExtmap(extmapLines[j]);

                elem.c('rtp-hdrext', {
                    xmlns: 'urn:xmpp:jingle:apps:rtp:rtp-hdrext:0',
                    uri: extmap.uri,
                    id: extmap.value
                });

                // eslint-disable-next-line max-depth
                if (extmap.hasOwnProperty('direction')) {

                    // eslint-disable-next-line max-depth
                    switch (extmap.direction) {
                    case MediaDirection.SENDONLY:
                        elem.attrs({ senders: 'responder' });
                        break;
                    case MediaDirection.RECVONLY:
                        elem.attrs({ senders: 'initiator' });
                        break;
                    case MediaDirection.SENDRECV:
                        elem.attrs({ senders: 'both' });
                        break;
                    case MediaDirection.INACTIVE:
                        elem.attrs({ senders: 'none' });
                        break;
                    }
                }

                // TODO: handle params
                elem.up();
            }
            elem.up(); // end of description
        }

        // map ice-ufrag/pwd, dtls fingerprint, candidates
        this.transportToJingle(i, elem);

        const m = this.media[i];

        if (SDPUtil.findLine(m, `a=${MediaDirection.SENDRECV}`, this.session)) {
            elem.attrs({ senders: 'both' });
        } else if (SDPUtil.findLine(m, `a=${MediaDirection.SENDONLY}`, this.session)) {
            elem.attrs({ senders: 'initiator' });
        } else if (SDPUtil.findLine(m, `a=${MediaDirection.RECVONLY}`, this.session)) {
            elem.attrs({ senders: 'responder' });
        } else if (SDPUtil.findLine(m, `a=${MediaDirection.INACTIVE}`, this.session)) {
            elem.attrs({ senders: 'none' });
        }

        // Reject an m-line only when port is 0 and a=bundle-only is not present in the section.
        // The port is automatically set to 0 when bundle-only is used.
        if (mline.port === '0' && !SDPUtil.findLine(m, 'a=bundle-only', this.session)) {
            // estos hack to reject an m-line
            elem.attrs({ senders: 'rejected' });
        }
        elem.up(); // end of content
    }
    elem.up();

    return elem;
};

SDP.prototype.transportToJingle = function(mediaindex, elem) {
    elem.c('transport');

    // XEP-0343 DTLS/SCTP
    const sctpmap
        = SDPUtil.findLine(this.media[mediaindex], 'a=sctpmap:', this.session);

    if (sctpmap) {
        const sctpAttrs = SDPUtil.parseSCTPMap(sctpmap);

        elem.c('sctpmap', {
            xmlns: 'urn:xmpp:jingle:transports:dtls-sctp:1',
            number: sctpAttrs[0], /* SCTP port */
            protocol: sctpAttrs[1] /* protocol */
        });

        // Optional stream count attribute
        if (sctpAttrs.length > 2) {
            elem.attrs({ streams: sctpAttrs[2] });
        }
        elem.up();
    }

    // XEP-0320
    const fingerprints
        = SDPUtil.findLines(
            this.media[mediaindex],
            'a=fingerprint:',
            this.session);

    fingerprints.forEach(line => {
        const fingerprint = SDPUtil.parseFingerprint(line);

        fingerprint.xmlns = 'urn:xmpp:jingle:apps:dtls:0';
        elem.c('fingerprint').t(fingerprint.fingerprint);
        delete fingerprint.fingerprint;

        const setupLine
            = SDPUtil.findLine(
                this.media[mediaindex],
                'a=setup:',
                this.session);

        if (setupLine) {
            fingerprint.setup = setupLine.substr(8);
        }
        elem.attrs(fingerprint);
        elem.up(); // end of fingerprint
    });
    const iceParameters = SDPUtil.iceparams(this.media[mediaindex], this.session);

    if (iceParameters) {
        iceParameters.xmlns = 'urn:xmpp:jingle:transports:ice-udp:1';
        elem.attrs(iceParameters);

        // XEP-0176
        const candidateLines
            = SDPUtil.findLines(
                this.media[mediaindex],
                'a=candidate:',
                this.session);

        candidateLines.forEach(line => { // add any a=candidate lines
            const candidate = SDPUtil.candidateToJingle(line);

            if (this.failICE) {
                candidate.ip = '1.1.1.1';
            }
            const protocol
                = candidate && typeof candidate.protocol === 'string'
                    ? candidate.protocol.toLowerCase()
                    : '';

            if ((this.removeTcpCandidates
                    && (protocol === 'tcp' || protocol === 'ssltcp'))
                || (this.removeUdpCandidates && protocol === 'udp')) {
                return;
            }
            elem.c('candidate', candidate).up();
        });
    }
    elem.up(); // end of transport
};

// XEP-0293
SDP.prototype.rtcpFbToJingle = function(mediaindex, elem, payloadtype) {
    const lines
        = SDPUtil.findLines(
            this.media[mediaindex],
            `a=rtcp-fb:${payloadtype}`);

    lines.forEach(line => {
        const feedback = SDPUtil.parseRTCPFB(line);

        if (feedback.type === 'trr-int') {
            elem.c('rtcp-fb-trr-int', {
                xmlns: 'urn:xmpp:jingle:apps:rtp:rtcp-fb:0',
                value: feedback.params[0]
            });
            elem.up();
        } else {
            elem.c('rtcp-fb', {
                xmlns: 'urn:xmpp:jingle:apps:rtp:rtcp-fb:0',
                type: feedback.type
            });
            if (feedback.params.length > 0) {
                elem.attrs({ 'subtype': feedback.params[0] });
            }
            elem.up();
        }
    });
};

SDP.prototype.rtcpFbFromJingle = function(elem, payloadtype) { // XEP-0293
    let sdp = '';
    const feedbackElementTrrInt
        = elem.find(
            '>rtcp-fb-trr-int[xmlns="urn:xmpp:jingle:apps:rtp:rtcp-fb:0"]');

    if (feedbackElementTrrInt.length) {
        sdp += 'a=rtcp-fb:* trr-int ';
        if (feedbackElementTrrInt.attr('value')) {
            sdp += feedbackElementTrrInt.attr('value');
        } else {
            sdp += '0';
        }
        sdp += '\r\n';
    }

    const feedbackElements = elem.find('>rtcp-fb[xmlns="urn:xmpp:jingle:apps:rtp:rtcp-fb:0"]');

    feedbackElements.each((_, fb) => {
        sdp += `a=rtcp-fb:${payloadtype} ${fb.getAttribute('type')}`;
        if (fb.hasAttribute('subtype')) {
            sdp += ` ${fb.getAttribute('subtype')}`;
        }
        sdp += '\r\n';
    });

    return sdp;
};

// construct an SDP from a jingle stanza
SDP.prototype.fromJingle = function(jingle) {
    const sessionId = Date.now();

    // Use a unique session id for every TPC.
    this.raw = 'v=0\r\n'
        + `o=- ${sessionId} 2 IN IP4 0.0.0.0\r\n`
        + 's=-\r\n'
        + 't=0 0\r\n';

    // http://tools.ietf.org/html/draft-ietf-mmusic-sdp-bundle-negotiation-04
    // #section-8
    const groups
        = $(jingle).find('>group[xmlns="urn:xmpp:jingle:apps:grouping:0"]');

    if (groups.length) {
        groups.each((idx, group) => {
            const contents
                = $(group)
                    .find('>content')
                    .map((_, content) => content.getAttribute('name'))
                    .get();

            if (contents.length > 0) {
                this.raw
                    += `a=group:${
                        group.getAttribute('semantics')
                            || group.getAttribute('type')} ${
                        contents.join(' ')}\r\n`;
            }
        });
    }

    this.session = this.raw;
    jingle.find('>content').each((_, content) => {
        const m = this.jingle2media($(content));

        this.media.push(m);
    });

    // reconstruct msid-semantic -- apparently not necessary
    /*
     var msid = SDPUtil.parseSSRC(this.raw);
     if (msid.hasOwnProperty('mslabel')) {
     this.session += "a=msid-semantic: WMS " + msid.mslabel + "\r\n";
     }
     */

    this.raw = this.session + this.media.join('');
};

// translate a jingle content element into an an SDP media part
SDP.prototype.jingle2media = function(content) {
    const desc = content.find('>description');
    const transport = content.find('>transport[xmlns="urn:xmpp:jingle:transports:ice-udp:1"]');
    let sdp = '';
    const sctp = transport.find(
        '>sctpmap[xmlns="urn:xmpp:jingle:transports:dtls-sctp:1"]');

    const media = { media: desc.attr('media') };

    media.port = '1';
    if (content.attr('senders') === 'rejected') {
        // estos hack to reject an m-line.
        media.port = '0';
    }
    if (transport.find('>fingerprint[xmlns="urn:xmpp:jingle:apps:dtls:0"]').length) {
        media.proto = sctp.length ? 'DTLS/SCTP' : 'RTP/SAVPF';
    } else {
        media.proto = 'RTP/AVPF';
    }
    if (sctp.length) {
        sdp += `m=application ${media.port} DTLS/SCTP ${
            sctp.attr('number')}\r\n`;
        sdp += `a=sctpmap:${sctp.attr('number')} ${sctp.attr('protocol')}`;

        const streamCount = sctp.attr('streams');

        if (streamCount) {
            sdp += ` ${streamCount}\r\n`;
        } else {
            sdp += '\r\n';
        }
    } else {
        media.fmt
            = desc
                .find('>payload-type')
                .map((_, payloadType) => payloadType.getAttribute('id'))
                .get();
        sdp += `${SDPUtil.buildMLine(media)}\r\n`;
    }

    sdp += 'c=IN IP4 0.0.0.0\r\n';
    if (!sctp.length) {
        sdp += 'a=rtcp:1 IN IP4 0.0.0.0\r\n';
    }

    // XEP-0176 ICE parameters
    if (transport.length) {
        if (transport.attr('ufrag')) {
            sdp += `${SDPUtil.buildICEUfrag(transport.attr('ufrag'))}\r\n`;
        }
        if (transport.attr('pwd')) {
            sdp += `${SDPUtil.buildICEPwd(transport.attr('pwd'))}\r\n`;
        }
        transport.find('>fingerprint[xmlns="urn:xmpp:jingle:apps:dtls:0"]').each((_, fingerprint) => {
            sdp += `a=fingerprint:${fingerprint.getAttribute('hash')}`;
            sdp += ` ${$(fingerprint).text()}`;
            sdp += '\r\n';
            if (fingerprint.hasAttribute('setup')) {
                sdp += `a=setup:${fingerprint.getAttribute('setup')}\r\n`;
            }
        });
    }

    // XEP-0176 ICE candidates
    transport.find('>candidate')
        .each((_, candidate) => {
            let protocol = candidate.getAttribute('protocol');

            protocol
                = typeof protocol === 'string' ? protocol.toLowerCase() : '';

            if ((this.removeTcpCandidates
                    && (protocol === 'tcp' || protocol === 'ssltcp'))
                || (this.removeUdpCandidates && protocol === 'udp')) {
                return;
            } else if (this.failICE) {
                candidate.setAttribute('ip', '1.1.1.1');
            }

            sdp += SDPUtil.candidateFromJingle(candidate);
        });

    switch (content.attr('senders')) {
    case 'initiator':
        sdp += `a=${MediaDirection.SENDONLY}\r\n`;
        break;
    case 'responder':
        sdp += `a=${MediaDirection.RECVONLY}\r\n`;
        break;
    case 'none':
        sdp += `a=${MediaDirection.INACTIVE}\r\n`;
        break;
    case 'both':
        sdp += `a=${MediaDirection.SENDRECV}\r\n`;
        break;
    }
    sdp += `a=mid:${content.attr('name')}\r\n`;

    // <description><rtcp-mux/></description>
    // see http://code.google.com/p/libjingle/issues/detail?id=309 -- no spec
    // though
    // and http://mail.jabber.org/pipermail/jingle/2011-December/001761.html
    if (desc.find('>rtcp-mux').length) {
        sdp += 'a=rtcp-mux\r\n';
    }

    desc.find('>payload-type').each((_, payloadType) => {
        sdp += `${SDPUtil.buildRTPMap(payloadType)}\r\n`;
        if ($(payloadType).find('>parameter').length) {
            sdp += `a=fmtp:${payloadType.getAttribute('id')} `;
            sdp
                += $(payloadType)
                    .find('>parameter')
                    .map((__, parameter) => {
                        const name = parameter.getAttribute('name');

                        return (
                            (name ? `${name}=` : '')
                                + parameter.getAttribute('value'));
                    })
                    .get()
                    .join('; ');
            sdp += '\r\n';
        }

        // xep-0293
        sdp += this.rtcpFbFromJingle($(payloadType), payloadType.getAttribute('id'));
    });

    // xep-0293
    sdp += this.rtcpFbFromJingle(desc, '*');

    // xep-0294
    desc
        .find('>rtp-hdrext[xmlns="urn:xmpp:jingle:apps:rtp:rtp-hdrext:0"]')
        .each((_, hdrExt) => {
            sdp
                += `a=extmap:${hdrExt.getAttribute('id')} ${
                    hdrExt.getAttribute('uri')}\r\n`;
        });

    // XEP-0339 handle ssrc-group attributes
    desc
        .find('>ssrc-group[xmlns="urn:xmpp:jingle:apps:rtp:ssma:0"]')
        .each((_, ssrcGroup) => {
            const semantics = ssrcGroup.getAttribute('semantics');
            const ssrcs
                = $(ssrcGroup)
                    .find('>source')
                    .map((__, source) => source.getAttribute('ssrc'))
                    .get();

            if (ssrcs.length) {
                sdp += `a=ssrc-group:${semantics} ${ssrcs.join(' ')}\r\n`;
            }
        });

    // XEP-0339 handle source attributes
    desc
        .find('>source[xmlns="urn:xmpp:jingle:apps:rtp:ssma:0"]')
        .each((_, source) => {
            const ssrc = source.getAttribute('ssrc');

            $(source)
                .find('>parameter')
                .each((__, parameter) => {
                    const name = parameter.getAttribute('name');
                    let value = parameter.getAttribute('value');

                    value = SDPUtil.filterSpecialChars(value);
                    sdp += `a=ssrc:${ssrc} ${name}`;
                    if (value && value.length) {
                        sdp += `:${value}`;
                    }
                    sdp += '\r\n';
                });
        });

    return sdp;
};
