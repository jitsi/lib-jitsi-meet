var logger = require("jitsi-meet-logger").getLogger(__filename);

module.exports = function(XMPP) {
    Strophe.addConnectionPlugin('focusAdmin', {
        sendRemoteMuteAudio: function (jid, success, failure){
            var iq = $iq({to: jid,
                type: 'set'})
                .c('focusAdmin', {xmlns: 'cloudversify:focusAdmin',
                    action: 'admin-mute-audio',
                    target: jid
                });

            // Calling tree() to print something useful
            iq = iq.tree();
            logger.info("Sending mute", iq);

            this.connection.sendIQ(iq,
                success,
                this.newJingleErrorHandler(iq, failure),
                IQ_TIMEOUT);
        },
        sendRemoteUnmuteAudio: function (jid, success, failure){
            var iq = $iq({to: jid,
                type: 'set'})
                .c('focusAdmin', {xmlns: 'cloudversify:focusAdmin',
                    action: 'admin-unmute-audio',
                    target: jid
                });

            // Calling tree() to print something useful
            iq = iq.tree();
            logger.info("Sending mute", iq);

            this.connection.sendIQ(iq,
                success,
                this.newJingleErrorHandler(iq, failure),
                IQ_TIMEOUT);
        },
        sendRemoteMuteVideo: function (jid, success, failure){
            var iq = $iq({to: jid,
                type: 'set'})
                .c('focusAdmin', {xmlns: 'cloudversify:focusAdmin',
                    action: 'admin-mute-video',
                    target: jid
                });

            // Calling tree() to print something useful
            iq = iq.tree();
            logger.info("Sending mute", iq);

            this.connection.sendIQ(iq,
                success,
                this.newJingleErrorHandler(iq, failure),
                IQ_TIMEOUT);
        },
        sendRemoteUnmuteVideo: function (jid, success, failure){
            var iq = $iq({to: jid,
                type: 'set'})
                .c('focusAdmin', {xmlns: 'cloudversify:focusAdmin',
                    action: 'admin-unmute-video',
                    target: jid
                });

            // Calling tree() to print something useful
            iq = iq.tree();
            logger.info("Sending mute", iq);

            this.connection.sendIQ(iq,
                success,
                this.newJingleErrorHandler(iq, failure),
                IQ_TIMEOUT);
        }
    });
};
