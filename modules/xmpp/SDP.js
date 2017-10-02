/* global $, APP */

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
    const self = this;
    const mediaSSRCs = {};
    let tmp;

    for (let mediaindex = 0; mediaindex < self.media.length; mediaindex++) {
        tmp = SDPUtil.findLines(self.media[mediaindex], 'a=ssrc:');
        const mid
            = SDPUtil.parseMID(
                SDPUtil.findLine(self.media[mediaindex], 'a=mid:'));
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
        tmp = SDPUtil.findLines(self.media[mediaindex], 'a=ssrc-group:');
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

// remove lines matching prefix from session section
SDP.prototype.removeSessionLines = function(prefix) {
    const self = this;
    const lines = SDPUtil.findLines(this.session, prefix);

    lines.forEach(line => {
        self.session = self.session.replace(`${line}\r\n`, '');
    });
    this.raw = this.session + this.media.join('');

    return lines;
};

// remove lines matching prefix from a media section specified by mediaindex
// TODO: non-numeric mediaindex could match mid
SDP.prototype.removeMediaLines = function(mediaindex, prefix) {
    const self = this;
    const lines = SDPUtil.findLines(this.media[mediaindex], prefix);

    lines.forEach(line => {
        self.media[mediaindex]
            = self.media[mediaindex].replace(`${line}\r\n`, '');
    });
    this.raw = this.session + this.media.join('');

    return lines;
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
            const crypto
                = SDPUtil.findLines(this.media[i], 'a=crypto:', this.session);

            if (crypto.length) {
                elem.c('encryption', { required: 1 });
                crypto.forEach(
                    line => elem.c('crypto', SDPUtil.parseCrypto(line)).up());
                elem.up(); // end of encryption
            }

            if (ssrc) {
                // new style mapping
                elem.c('source', { ssrc,
                    xmlns: 'urn:xmpp:jingle:apps:rtp:ssma:0' });

                // FIXME: group by ssrc and support multiple different ssrcs
                const ssrclines = SDPUtil.findLines(this.media[i], 'a=ssrc:');

                if (ssrclines.length > 0) {
                    // eslint-disable-next-line no-loop-func
                    ssrclines.forEach(line => {
                        const idx = line.indexOf(' ');
                        const linessrc = line.substr(0, idx).substr(7);

                        if (linessrc !== ssrc) {
                            elem.up();
                            ssrc = linessrc;
                            elem.c('source', { ssrc,
                                xmlns: 'urn:xmpp:jingle:apps:rtp:ssma:0' });
                        }
                        const kv = line.substr(idx + 1);

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
                } else {
                    elem.up();
                    elem.c('source', { ssrc,
                        xmlns: 'urn:xmpp:jingle:apps:rtp:ssma:0' });
                    elem.c('parameter');
                    elem.attrs({
                        name: 'cname',

                        // eslint-disable-next-line newline-per-chained-call
                        value: Math.random().toString(36).substring(7)
                    });
                    elem.up();

                    // FIXME what case does this code handle ? remove ???
                    let msid = null;

                    // FIXME what is this ? global APP.RTC in SDP ?
                    const localTrack = APP.RTC.getLocalTracks(mline.media);

                    // eslint-disable-next-line max-depth
                    if (localTrack) {
                        // FIXME before this changes the track id was accessed,
                        // but msid stands for the stream id, makes no sense ?
                        msid = localTrack.getTrackId();
                    }

                    // eslint-disable-next-line max-depth
                    if (msid !== null) {
                        msid = SDPUtil.filterSpecialChars(msid);
                        elem.c('parameter');
                        elem.attrs({ name: 'msid',
                            value: msid });
                        elem.up();
                        elem.c('parameter');
                        elem.attrs({ name: 'mslabel',
                            value: msid });
                        elem.up();
                        elem.c('parameter');
                        elem.attrs({ name: 'label',
                            value: msid });
                        elem.up();
                    }
                }
                elem.up();

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

            if (ridLines.length) {
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
        if (mline.port === '0') {
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
    const self = this;

    elem.c('transport');

    // XEP-0343 DTLS/SCTP
    const sctpmap
        = SDPUtil.findLine(this.media[mediaindex], 'a=sctpmap:', self.session);

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
                self.media[mediaindex],
                'a=setup:',
                self.session);
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

                if (self.failICE) {
                    candidate.ip = '1.1.1.1';
                }
                const protocol
                    = candidate && typeof candidate.protocol === 'string'
                        ? candidate.protocol.toLowerCase()
                        : '';

                if ((self.removeTcpCandidates
                        && (protocol === 'tcp' || protocol === 'ssltcp'))
                    || (self.removeUdpCandidates && protocol === 'udp')) {
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
    tmp.each(function() {
        /* eslint-disable no-invalid-this */
        media += `a=rtcp-fb:${payloadtype} ${$(this).attr('type')}`;
        if ($(this).attr('subtype')) {
            media += ` ${$(this).attr('subtype')}`;
        }
        media += '\r\n';

        /* eslint-enable no-invalid-this */
    });

    return media;
};

// construct an SDP from a jingle stanza
SDP.prototype.fromJingle = function(jingle) {
    const self = this;

    this.raw = 'v=0\r\n'
        + 'o=- 1923518516 2 IN IP4 0.0.0.0\r\n'// FIXME
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
                self.raw
                    += `a=group:${
                        group.getAttribute('semantics')
                            || group.getAttribute('type')} ${
                        contents.join(' ')}\r\n`;
            }
        });
    }

    this.session = this.raw;
    jingle.find('>content').each(function() {
        // eslint-disable-next-line no-invalid-this
        const m = self.jingle2media($(this));

        self.media.push(m);
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
    const self = this;
    const sctp = content.find(
        '>transport>sctpmap[xmlns="urn:xmpp:jingle:transports:dtls-sctp:1"]');

    let tmp = { media: desc.attr('media') };

    tmp.port = '1';
    if (content.attr('senders') === 'rejected') {
        // estos hack to reject an m-line.
        tmp.port = '0';
    }
    if (content.find('>transport>fingerprint').length
            || desc.find('encryption').length) {
        tmp.proto = sctp.length ? 'DTLS/SCTP' : 'RTP/SAVPF';
    } else {
        tmp.proto = 'RTP/AVPF';
    }
    if (sctp.length) {
        media += `m=application 1 DTLS/SCTP ${sctp.attr('number')}\r\n`;
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
                .map(function() {
                    // eslint-disable-next-line no-invalid-this
                    return this.getAttribute('id');
                })
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
        tmp.find('>fingerprint').each(function() {
            /* eslint-disable no-invalid-this */
            // FIXME: check namespace at some point
            media += `a=fingerprint:${this.getAttribute('hash')}`;
            media += ` ${$(this).text()}`;
            media += '\r\n';
            if (this.getAttribute('setup')) {
                media += `a=setup:${this.getAttribute('setup')}\r\n`;
            }

            /* eslint-enable no-invalid-this */
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

    if (desc.find('encryption').length) {
        desc.find('encryption>crypto').each(function() {
            /* eslint-disable no-invalid-this */
            media += `a=crypto:${this.getAttribute('tag')}`;
            media += ` ${this.getAttribute('crypto-suite')}`;
            media += ` ${this.getAttribute('key-params')}`;
            if (this.getAttribute('session-params')) {
                media += ` ${this.getAttribute('session-params')}`;
            }
            media += '\r\n';

            /* eslint-enable no-invalid-this */
        });
    }
    desc.find('payload-type').each(function() {
        /* eslint-disable no-invalid-this */
        media += `${SDPUtil.buildRTPMap(this)}\r\n`;
        if ($(this).find('>parameter').length) {
            media += `a=fmtp:${this.getAttribute('id')} `;
            media
                += $(this)
                    .find('parameter')
                    .map(function() {
                        const name = this.getAttribute('name');

                        return (
                            (name ? `${name}=` : '')
                                + this.getAttribute('value'));
                    })
                    .get()
                    .join('; ');
            media += '\r\n';
        }

        // xep-0293
        media += self.rtcpFbFromJingle($(this), this.getAttribute('id'));

        /* eslint-enable no-invalid-this */
    });

    // xep-0293
    media += self.rtcpFbFromJingle(desc, '*');

    // xep-0294
    tmp
        = desc.find(
            '>rtp-hdrext[xmlns="urn:xmpp:jingle:apps:rtp:rtp-hdrext:0"]');
    tmp.each(function() {
        /* eslint-disable no-invalid-this */
        media
            += `a=extmap:${this.getAttribute('id')} ${
                this.getAttribute('uri')}\r\n`;

        /* eslint-enable no-invalid-this */
    });

    content
        .find(
            '>transport[xmlns="urn:xmpp:jingle:transports:ice-udp:1"]'
                + '>candidate')
        .each(function() {
            /* eslint-disable no-invalid-this */
            let protocol = this.getAttribute('protocol');

            protocol
                = typeof protocol === 'string' ? protocol.toLowerCase() : '';

            if ((self.removeTcpCandidates
                    && (protocol === 'tcp' || protocol === 'ssltcp'))
                || (self.removeUdpCandidates && protocol === 'udp')) {
                return;
            } else if (self.failICE) {
                this.setAttribute('ip', '1.1.1.1');
            }

            media += SDPUtil.candidateFromJingle(this);

            /* eslint-enable no-invalid-this */
        });

    // XEP-0339 handle ssrc-group attributes
    content
        .find('description>ssrc-group[xmlns="urn:xmpp:jingle:apps:rtp:ssma:0"]')
        .each(function() {
            /* eslint-disable no-invalid-this */
            const semantics = this.getAttribute('semantics');
            const ssrcs
                = $(this)
                    .find('>source')
                    .map(function() {
                        return this.getAttribute('ssrc');
                    })
                    .get();

            if (ssrcs.length) {
                media += `a=ssrc-group:${semantics} ${ssrcs.join(' ')}\r\n`;
            }

            /* eslint-enable no-invalid-this */
        });

    tmp
        = content.find(
            'description>source[xmlns="urn:xmpp:jingle:apps:rtp:ssma:0"]');
    tmp.each(function() {
        /* eslint-disable no-invalid-this */
        const ssrc = this.getAttribute('ssrc');

        // eslint-disable-next-line newline-per-chained-call
        $(this).find('>parameter').each(function() {
            const name = this.getAttribute('name');
            let value = this.getAttribute('value');

            value = SDPUtil.filterSpecialChars(value);
            media += `a=ssrc:${ssrc} ${name}`;
            if (value && value.length) {
                media += `:${value}`;
            }
            media += '\r\n';
        });

        /* eslint-enable no-invalid-this */
    });

    return media;
};
