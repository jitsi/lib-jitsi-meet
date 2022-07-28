import { RFC2198Encoder } from './red.js';

describe('RED', () => {
    let encoder;
    const opusPayloadType = 111;

    beforeEach(() => {
        encoder = new RFC2198Encoder();
        encoder.setPayloadType(opusPayloadType);
    });

    describe('addRedundancy with a redundancy of 1', () => {
        beforeEach(() => {
            encoder.setRedundancy(1);
        });
        it('adds redundancy on the first packet', () => {
            const spy = jasmine.createSpy();

            encoder.addRedundancy({
                data: new Uint8Array([ 0x00 ]),
                timestamp: 0
            }, { enqueue: spy });
            expect(spy.calls.count()).toEqual(1);
            expect(spy.calls.argsFor(0)[0].data).toEqual(new Uint8Array([ 0x6f, 0x00 ]).buffer);
        });

        it('adds redundancy on the first and second packet', () => {
            const spy = jasmine.createSpy();

            encoder.addRedundancy({
                data: new Uint8Array([ 0xde ]),
                timestamp: 0
            }, { enqueue: spy });
            encoder.addRedundancy({
                data: new Uint8Array([ 0xad, 0xbe ]),
                timestamp: 960
            }, { enqueue: spy });

            expect(spy.calls.count()).toEqual(2);
            expect(spy.calls.argsFor(0)[0].data).toEqual(new Uint8Array([ 0x6f, 0xde ]).buffer);
            expect(spy.calls.argsFor(1)[0].data).toEqual(new Uint8Array([
                0xef, 0x0f, 0x00, 0x01, 0x6f, 0xde, 0xad, 0xbe ]).buffer);
        });

        it('does not add redundancy for the first packet on the third packet', () => {
            const spy = jasmine.createSpy();

            encoder.addRedundancy({
                data: new Uint8Array([ 0xde ]),
                timestamp: 0
            }, { enqueue: spy });
            encoder.addRedundancy({
                data: new Uint8Array([ 0xad, 0xbe ]),
                timestamp: 960
            }, { enqueue: spy });
            encoder.addRedundancy({
                data: new Uint8Array([ 0xef, 0xff, 0xff ]),
                timestamp: 1920
            }, { enqueue: spy });

            expect(spy.calls.count()).toEqual(3);
            expect(spy.calls.argsFor(0)[0].data).toEqual(new Uint8Array([ 0x6f, 0xde ]).buffer);
            expect(spy.calls.argsFor(1)[0].data).toEqual(new Uint8Array([
                0xef, 0x0f, 0x00, 0x01, 0x6f, 0xde, 0xad, 0xbe ]).buffer);
            expect(spy.calls.argsFor(2)[0].data).toEqual(new Uint8Array([
                0xef, 0x0f, 0x00, 0x02, 0x6f, 0xad, 0xbe, 0xef, 0xff, 0xff ]).buffer);
        });

        it('does not add redundancy for DTX packets with a 400ms timestamp gap', () => {
            const spy = jasmine.createSpy();

            encoder.addRedundancy({
                data: new Uint8Array([ 0xde ]),
                timestamp: 0
            }, { enqueue: spy });
            encoder.addRedundancy({
                data: new Uint8Array([ 0xad, 0xbe ]),
                timestamp: 19200
            }, { enqueue: spy });
            encoder.addRedundancy({
                data: new Uint8Array([ 0xef, 0xff, 0xff ]),
                timestamp: 20160
            }, { enqueue: spy });
            expect(spy.calls.count()).toEqual(3);
            expect(spy.calls.argsFor(0)[0].data).toEqual(new Uint8Array([ 0x6f, 0xde ]).buffer);
            expect(spy.calls.argsFor(1)[0].data).toEqual(new Uint8Array([ 0x6f, 0xad, 0xbe ]).buffer);
            expect(spy.calls.argsFor(2)[0].data).toEqual(new Uint8Array([
                0xef, 0x0f, 0x00, 0x02, 0x6f, 0xad, 0xbe, 0xef, 0xff, 0xff ]).buffer);
        });
    });

    describe('addRedundancy with a redundancy of 2', () => {
        beforeEach(() => {
            encoder.setRedundancy(2);
        });
        it('adds redundancy on the first, second and third packet', () => {
            const spy = jasmine.createSpy();

            encoder.addRedundancy({
                data: new Uint8Array([ 0xde ]),
                timestamp: 0
            }, { enqueue: spy });
            encoder.addRedundancy({
                data: new Uint8Array([ 0xad, 0xbe ]),
                timestamp: 960
            }, { enqueue: spy });
            encoder.addRedundancy({
                data: new Uint8Array([ 0xef, 0xff, 0xff ]),
                timestamp: 1920
            }, { enqueue: spy });

            expect(spy.calls.count()).toEqual(3);
            expect(spy.calls.argsFor(0)[0].data).toEqual(new Uint8Array([ 0x6f, 0xde ]).buffer);
            expect(spy.calls.argsFor(1)[0].data).toEqual(new Uint8Array([
                0xef, 0x0f, 0x00, 0x01, 0x6f, 0xde, 0xad, 0xbe ]).buffer);
            expect(spy.calls.argsFor(2)[0].data).toEqual(new Uint8Array([
                0xef, 0x1e, 0x00, 0x01, 0xef, 0x0f, 0x00, 0x02, 0x6f, 0xde, 0xad, 0xbe, 0xef, 0xff, 0xff ]).buffer);
        });

        it('does not add redundancy for the first packet on the fourth packet', () => {
            const spy = jasmine.createSpy();

            encoder.addRedundancy({
                data: new Uint8Array([ 0xde ]),
                timestamp: 0
            }, { enqueue: spy });
            encoder.addRedundancy({
                data: new Uint8Array([ 0xad, 0xbe ]),
                timestamp: 960
            }, { enqueue: spy });
            encoder.addRedundancy({
                data: new Uint8Array([ 0xef, 0xff, 0xff ]),
                timestamp: 1920
            }, { enqueue: spy });
            encoder.addRedundancy({
                data: new Uint8Array([ 0xfa, 0x1f, 0xfa, 0x1f ]),
                timestamp: 2880
            }, { enqueue: spy });

            expect(spy.calls.count()).toEqual(4);
            expect(spy.calls.argsFor(0)[0].data).toEqual(new Uint8Array([ 0x6f, 0xde ]).buffer);
            expect(spy.calls.argsFor(1)[0].data).toEqual(new Uint8Array([
                0xef, 0x0f, 0x00, 0x01, 0x6f, 0xde, 0xad, 0xbe ]).buffer);
            expect(spy.calls.argsFor(2)[0].data).toEqual(new Uint8Array([
                0xef, 0x1e, 0x00, 0x01, 0xef, 0x0f, 0x00, 0x02, 0x6f, 0xde, 0xad, 0xbe, 0xef, 0xff, 0xff ]).buffer);
            expect(spy.calls.argsFor(3)[0].data).toEqual(new Uint8Array([
                0xef, 0x1e, 0x00, 0x02, 0xef, 0x0f, 0x00, 0x03, 0x6f,
                0xad, 0xbe, 0xef, 0xff, 0xff, 0xfa, 0x1f, 0xfa, 0x1f ]).buffer);
        });
    });

    describe('setRedundancy', () => {
        it('reduces the redundancy', () => {
            const spy = jasmine.createSpy();

            encoder.setRedundancy(2);
            encoder.addRedundancy({
                data: new Uint8Array([ 0xde ]),
                timestamp: 0
            }, { enqueue: spy });
            encoder.addRedundancy({
                data: new Uint8Array([ 0xad, 0xbe ]),
                timestamp: 960
            }, { enqueue: spy });
            encoder.setRedundancy(1);
            encoder.addRedundancy({
                data: new Uint8Array([ 0xef, 0xff, 0xff ]),
                timestamp: 1920
            }, { enqueue: spy });

            expect(spy.calls.count()).toEqual(3);
            expect(spy.calls.argsFor(0)[0].data).toEqual(new Uint8Array([ 0x6f, 0xde ]).buffer);
            expect(spy.calls.argsFor(1)[0].data).toEqual(new Uint8Array([
                0xef, 0x0f, 0x00, 0x01, 0x6f, 0xde, 0xad, 0xbe ]).buffer);
            expect(spy.calls.argsFor(2)[0].data).toEqual(new Uint8Array([
                0xef, 0x0f, 0x00, 0x02, 0x6f, 0xad, 0xbe, 0xef, 0xff, 0xff ]).buffer);
        });

        it('increases the redundancy', () => {
            const spy = jasmine.createSpy();

            encoder.addRedundancy({
                data: new Uint8Array([ 0xde ]),
                timestamp: 0
            }, { enqueue: spy });
            encoder.setRedundancy(2);
            encoder.addRedundancy({
                data: new Uint8Array([ 0xad, 0xbe ]),
                timestamp: 960
            }, { enqueue: spy });
            encoder.addRedundancy({
                data: new Uint8Array([ 0xef, 0xff, 0xff ]),
                timestamp: 1920
            }, { enqueue: spy });

            expect(spy.calls.count()).toEqual(3);
            expect(spy.calls.argsFor(0)[0].data).toEqual(new Uint8Array([ 0x6f, 0xde ]).buffer);
            expect(spy.calls.argsFor(1)[0].data).toEqual(new Uint8Array([
                0xef, 0x0f, 0x00, 0x01, 0x6f, 0xde, 0xad, 0xbe ]).buffer);
            expect(spy.calls.argsFor(2)[0].data).toEqual(new Uint8Array([
                0xef, 0x1e, 0x00, 0x01, 0xef, 0x0f, 0x00, 0x02,
                0x6f, 0xde, 0xad, 0xbe, 0xef, 0xff, 0xff ]).buffer);
        });
    });
});
