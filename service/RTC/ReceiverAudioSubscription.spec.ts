import {
    IReceiverAudioSubscriptionMessage,
    ReceiverAudioSubscription,
    normalizeReceiverAudioSubscription
} from "./ReceiverAudioSubscription";

describe( "/service/RTC/ReceiverAudioSubscription", () => {
    describe( "normalizeReceiverAudioSubscription", () => {
        it( "maps the legacy ALL mode", () => {
            expect( normalizeReceiverAudioSubscription( { mode: ReceiverAudioSubscription.ALL } ) )
                .toEqual( { all: true, exclude: [], include: [] } );
        } );

        it( "maps the legacy NONE mode", () => {
            expect( normalizeReceiverAudioSubscription( { mode: ReceiverAudioSubscription.NONE } ) )
                .toEqual( { all: false, exclude: [], include: [] } );
        } );

        it( "maps the legacy INCLUDE mode with a list", () => {
            expect( normalizeReceiverAudioSubscription(
                { list: [ 'a-a0', 'b-a0' ], mode: ReceiverAudioSubscription.INCLUDE } ) )
                .toEqual( { all: false, exclude: [], include: [ 'a-a0', 'b-a0' ] } );
        } );

        it( "maps the legacy EXCLUDE mode with a list", () => {
            expect( normalizeReceiverAudioSubscription(
                { list: [ 'a-a0' ], mode: ReceiverAudioSubscription.EXCLUDE } ) )
                .toEqual( { all: true, exclude: [ 'a-a0' ], include: [] } );
        } );

        it( "defaults a missing list to empty", () => {
            expect( normalizeReceiverAudioSubscription( { mode: ReceiverAudioSubscription.INCLUDE } ) )
                .toEqual( { all: false, exclude: [], include: [] } );
        } );

        it( "passes through a current message", () => {
            const message: IReceiverAudioSubscriptionMessage = {
                all: false,
                exclude: [ 'x-a0' ],
                include: [ 'y-a0.en' ]
            };

            expect( normalizeReceiverAudioSubscription( message ) )
                .toEqual( { all: false, exclude: [ 'x-a0' ], include: [ 'y-a0.en' ] } );
        } );

        it( "defaults missing fields on a current message", () => {
            expect( normalizeReceiverAudioSubscription( {} ) )
                .toEqual( { all: true, exclude: [], include: [] } );
        } );
    } );
} );
