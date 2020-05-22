/* global $ */

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
    let tmp;

    for (let mediaindex = 0; mediaindex < this.media.length; mediaindex++) {
        tmp = SDPUtil.findLines(this.media[mediaindex], 'a=ssrc:');
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
        tmp.forEach(line => {
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
        tmp = SDPUtil.findLines(this.media[mediaindex], 'a=ssrc-group:');
        tmp.forEach(line => {
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

// remove iSAC and CN from SDP
SDP.prototype.mangle = function() {
    let i, j, lines, mline, newdesc, rtpmap;

    for (i = 0; i < this.media.length; i++) {
        lines = this.media[i].split('\r\n');
        lines.pop(); // remove empty last element
        mline = SDPUtil.parseMLine(lines.shift());
        if (mline.media !== 'audio') {
            continue; // eslint-disable-line no-continue
        }
        newdesc = '';
        mline.fmt.length = 0;
        for (j = 0; j < lines.length; j++) {
            if (lines[j].substr(0, 9) === 'a=rtpmap:') {
                rtpmap = SDPUtil.parseRTPMap(lines[j]);
                if (rtpmap.name === 'CN' || rtpmap.name === 'ISAC') {
                    continue; // eslint-disable-line no-continue
                }
                mline.fmt.push(rtpmap.id);
            }
            newdesc += `${lines[j]}\r\n`;
        }
        this.media[i] = `${SDPUtil.buildMLine(mline)}\r\n${newdesc}`;
    }
    this.raw = this.session + this.media.join('');
};

// add content's to a jingle element
SDP.prototype.toJingle = function(elem, thecreator) {
    let i, j, k, lines, mline, rtpmap, ssrc, tmp;

    // new bundle plan

    lines = SDPUtil.findLines(this.session, 'a=group:');
    if (lines.length) {
        for (i = 0; i < lines.length; i++) {
            tmp = lines[i].split(' ');
            const semantics = tmp.shift().substr(8);

            elem.c('group', { xmlns: 'urn:xmpp:jingle:apps:grouping:0',
                semantics });
            for (j = 0; j < tmp.length; j++) {
                elem.c('content', { name: tmp[j] }).up();
            }
            elem.up();
        }
    }
    for (i = 0; i < this.media.length; i++) {
        mline = SDPUtil.parseMLine(this.media[i].split('\r\n')[0]);
        if (!(mline.media === 'audio'
              || mline.media === 'video'
              || mline.media === 'application')) {
            continue; // eslint-disable-line no-continue
        }
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

        if (SDPUtil.findLine(this.media[i], 'a=rtpmap:').length) {
            elem.c('description',
                { xmlns: 'urn:xmpp:jingle:apps:rtp:1',
                    media: mline.media });
            if (ssrc) {
                elem.attrs({ ssrc });
            }
            for (j = 0; j < mline.fmt.length; j++) {
                rtpmap
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
                    tmp = SDPUtil.parseFmtp(afmtpline);

                    // eslint-disable-next-line max-depth
                    for (k = 0; k < tmp.length; k++) {
                        elem.c('parameter', tmp[k]).up();
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

            const ridLines = SDPUtil.findLines(this.media[i], 'a=rid');

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
                    = SDPUtil.findLine(this.media[i], 'a=simulcast');

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
            lines = SDPUtil.findLines(this.media[i], 'a=extmap:');
            if (lines.length) {
                for (j = 0; j < lines.length; j++) {
                    tmp = SDPUtil.parseExtmap(lines[j]);
                    elem.c('rtp-hdrext', {
                        xmlns: 'urn:xmpp:jingle:apps:rtp:rtp-hdrext:0',
                        uri: tmp.uri,
                        id: tmp.value
                    });

                    // eslint-disable-next-line max-depth
                    if (tmp.hasOwnProperty('direction')) {

                        // eslint-disable-next-line max-depth
                        switch (tmp.direction) {
                        case 'sendonly':
                            elem.attrs({ senders: 'responder' });
                            break;
                        case 'recvonly':
                            elem.attrs({ senders: 'initiator' });
                            break;
                        case 'sendrecv':
                            elem.attrs({ senders: 'both' });
                            break;
                        case 'inactive':
                            elem.attrs({ senders: 'none' });
                            break;
                        }
                    }

                    // TODO: handle params
                    elem.up();
                }
            }
            elem.up(); // end of description
        }

        // map ice-ufrag/pwd, dtls fingerprint, candidates
        this.transportToJingle(i, elem);

        const m = this.media[i];

        if (SDPUtil.findLine(m, 'a=sendrecv', this.session)) {
            elem.attrs({ senders: 'both' });
        } else if (SDPUtil.findLine(m, 'a=sendonly', this.session)) {
            elem.attrs({ senders: 'initiator' });
        } else if (SDPUtil.findLine(m, 'a=recvonly', this.session)) {
            elem.attrs({ senders: 'responder' });
        } else if (SDPUtil.findLine(m, 'a=inactive', this.session)) {
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
    let tmp;

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
        tmp = SDPUtil.parseFingerprint(line);
        tmp.xmlns = 'urn:xmpp:jingle:apps:dtls:0';
        elem.c('fingerprint').t(tmp.fingerprint);
        delete tmp.fingerprint;

        // eslint-disable-next-line no-param-reassign
        line
            = SDPUtil.findLine(
                this.media[mediaindex],
                'a=setup:',
                this.session);
        if (line) {
            tmp.setup = line.substr(8);
        }
        elem.attrs(tmp);
        elem.up(); // end of fingerprint
    });
    tmp = SDPUtil.iceparams(this.media[mediaindex], this.session);
    if (tmp) {
        tmp.xmlns = 'urn:xmpp:jingle:transports:ice-udp:1';
        elem.attrs(tmp);

        // XEP-0176
        const lines
            = SDPUtil.findLines(
                this.media[mediaindex],
                'a=candidate:',
                this.session);

        if (lines.length) { // add any a=candidate lines
            lines.forEach(line => {
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
        const tmp = SDPUtil.parseRTCPFB(line);

        if (tmp.type === 'trr-int') {
            elem.c('rtcp-fb-trr-int', {
                xmlns: 'urn:xmpp:jingle:apps:rtp:rtcp-fb:0',
                value: tmp.params[0]
            });
            elem.up();
        } else {
            elem.c('rtcp-fb', {
                xmlns: 'urn:xmpp:jingle:apps:rtp:rtcp-fb:0',
                type: tmp.type
            });
            if (tmp.params.length > 0) {
                elem.attrs({ 'subtype': tmp.params[0] });
            }
            elem.up();
        }
    });
};

SDP.prototype.rtcpFbFromJingle = function(elem, payloadtype) { // XEP-0293
    let media = '';
    let tmp
        = elem.find(
            '>rtcp-fb-trr-int[xmlns="urn:xmpp:jingle:apps:rtp:rtcp-fb:0"]');

    if (tmp.length) {
        media += 'a=rtcp-fb:* trr-int ';
        if (tmp.attr('value')) {
            media += tmp.attr('value');
        } else {
            media += '0';
        }
        media += '\r\n';
    }
    tmp = elem.find('>rtcp-fb[xmlns="urn:xmpp:jingle:apps:rtp:rtcp-fb:0"]');
    tmp.each((_, fb) => {
        media += `a=rtcp-fb:${payloadtype} ${fb.getAttribute('type')}`;
        if (fb.hasAttribute('subtype')) {
            media += ` ${fb.getAttribute('subtype')}`;
        }
        media += '\r\n';
    });

    return media;
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
    const desc = content.find('description');
    let media = '';
    const sctp = content.find(
        '>transport>sctpmap[xmlns="urn:xmpp:jingle:transports:dtls-sctp:1"]');

    let tmp = { media: desc.attr('media') };

    tmp.port = '1';
    if (content.attr('senders') === 'rejected') {
        // estos hack to reject an m-line.
        tmp.port = '0';
    }
    if (content.find('>transport>fingerprint[xmlns="urn:xmpp:jingle:apps:dtls:0"]').length) {
        tmp.proto = sctp.length ? 'DTLS/SCTP' : 'RTP/SAVPF';
    } else {
        tmp.proto = 'RTP/AVPF';
    }
    if (sctp.length) {
        media += `m=application ${tmp.port} DTLS/SCTP ${
            sctp.attr('number')}\r\n`;
        media += `a=sctpmap:${sctp.attr('number')} ${sctp.attr('protocol')}`;

        const streamCount = sctp.attr('streams');

        if (streamCount) {
            media += ` ${streamCount}\r\n`;
        } else {
            media += '\r\n';
        }
    } else {
        tmp.fmt
            = desc
                .find('payload-type')
                .map((_, payloadType) => payloadType.getAttribute('id'))
                .get();
        media += `${SDPUtil.buildMLine(tmp)}\r\n`;
    }

    media += 'c=IN IP4 0.0.0.0\r\n';
    if (!sctp.length) {
        media += 'a=rtcp:1 IN IP4 0.0.0.0\r\n';
    }
    tmp
        = content.find(
            '>transport[xmlns="urn:xmpp:jingle:transports:ice-udp:1"]');
    if (tmp.length) {
        if (tmp.attr('ufrag')) {
            media += `${SDPUtil.buildICEUfrag(tmp.attr('ufrag'))}\r\n`;
        }
        if (tmp.attr('pwd')) {
            media += `${SDPUtil.buildICEPwd(tmp.attr('pwd'))}\r\n`;
        }
        tmp.find('>fingerprint[xmlns="urn:xmpp:jingle:apps:dtls:0"]').each((_, fingerprint) => {
            media += `a=fingerprint:${fingerprint.getAttribute('hash')}`;
            media += ` ${$(fingerprint).text()}`;
            media += '\r\n';
            if (fingerprint.hasAttribute('setup')) {
                media += `a=setup:${fingerprint.getAttribute('setup')}\r\n`;
            }
        });
    }
    switch (content.attr('senders')) {
    case 'initiator':
        media += 'a=sendonly\r\n';
        break;
    case 'responder':
        media += 'a=recvonly\r\n';
        break;
    case 'none':
        media += 'a=inactive\r\n';
        break;
    case 'both':
        media += 'a=sendrecv\r\n';
        break;
    }
    media += `a=mid:${content.attr('name')}\r\n`;

    // <description><rtcp-mux/></description>
    // see http://code.google.com/p/libjingle/issues/detail?id=309 -- no spec
    // though
    // and http://mail.jabber.org/pipermail/jingle/2011-December/001761.html
    if (desc.find('rtcp-mux').length) {
        media += 'a=rtcp-mux\r\n';
    }

    desc.find('payload-type').each((_, payloadType) => {
        media += `${SDPUtil.buildRTPMap(payloadType)}\r\n`;
        if ($(payloadType).find('>parameter').length) {
            media += `a=fmtp:${payloadType.getAttribute('id')} `;
            media
                += $(payloadType)
                    .find('parameter')
                    .map((__, parameter) => {
                        const name = parameter.getAttribute('name');

                        return (
                            (name ? `${name}=` : '')
                                + parameter.getAttribute('value'));
                    })
                    .get()
                    .join('; ');
            media += '\r\n';
        }

        // xep-0293
        media += this.rtcpFbFromJingle($(payloadType), payloadType.getAttribute('id'));
    });

    // xep-0293
    media += this.rtcpFbFromJingle(desc, '*');

    // xep-0294
    tmp
        = desc.find(
            '>rtp-hdrext[xmlns="urn:xmpp:jingle:apps:rtp:rtp-hdrext:0"]');
    tmp.each((_, hdrExt) => {
        media
            += `a=extmap:${hdrExt.getAttribute('id')} ${
                hdrExt.getAttribute('uri')}\r\n`;
    });

    content
        .find(
            '>transport[xmlns="urn:xmpp:jingle:transports:ice-udp:1"]'
                + '>candidate')
        .each((_, transport) => {
            let protocol = transport.getAttribute('protocol');

            protocol
                = typeof protocol === 'string' ? protocol.toLowerCase() : '';

            if ((this.removeTcpCandidates
                    && (protocol === 'tcp' || protocol === 'ssltcp'))
                || (this.removeUdpCandidates && protocol === 'udp')) {
                return;
            } else if (this.failICE) {
                transport.setAttribute('ip', '1.1.1.1');
            }

            media += SDPUtil.candidateFromJingle(transport);
        });

    // XEP-0339 handle ssrc-group attributes
    content
        .find('description>ssrc-group[xmlns="urn:xmpp:jingle:apps:rtp:ssma:0"]')
        .each((_, ssrcGroup) => {
            const semantics = ssrcGroup.getAttribute('semantics');
            const ssrcs
                = $(ssrcGroup)
                    .find('>source')
                    .map((__, source) => source.getAttribute('ssrc'))
                    .get();

            if (ssrcs.length) {
                media += `a=ssrc-group:${semantics} ${ssrcs.join(' ')}\r\n`;
            }
        });

    tmp
        = content.find(
            'description>source[xmlns="urn:xmpp:jingle:apps:rtp:ssma:0"]');
    tmp.each((_, source) => {
        const ssrc = source.getAttribute('ssrc');

        $(source)
            .find('>parameter')
            .each((__, parameter) => {
                const name = parameter.getAttribute('name');
                let value = parameter.getAttribute('value');

                value = SDPUtil.filterSpecialChars(value);
                media += `a=ssrc:${ssrc} ${name}`;
                if (value && value.length) {
                    media += `:${value}`;
                }
                media += '\r\n';
            });
    });

    return media;
};
