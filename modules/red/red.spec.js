import {RFC2198Encoder} from './red.js';

describe('RED', () => {
    let encoder;
    const opusPayloadType = 111;
    beforeEach(() => {
        encoder = new RFC2198Encoder();
        encoder.setOpusPayloadType(opusPayloadType);
    });

    describe('addRedundancy with a redundancy of 1', () => {
        beforeEach(() => {
            encoder.setRedundancy(1);
        });
        it('adds redundancy on the first packet', () => {
            const spy = jasmine.createSpy();
            encoder.addRedundancy({
                data: new Uint8Array([0x00]),
                timestamp: 0,
            }, {enqueue: spy});
            expect(spy.calls.count()).toEqual(1);
            expect(spy.calls.argsFor(0)[0].data).toEqual((new Uint8Array([0x6f, 0x00])).buffer);
        });

        /*
        it('adds redundancy on the first and second packet', () => {
            const stub = sinon.stub();
            encoder.addRedundancy({
                data: new Uint8Array([0xde]),
                timestamp: 0,
            }, {enqueue: stub});
            encoder.addRedundancy({
                data: new Uint8Array([0xad, 0xbe]),
                timestamp: 960,
            }, {enqueue: stub});

            expect(stub.callCount).to.equal(2);
            expect(Buffer.from(stub.getCall(0).args[0].data)).to.deep.equal(Buffer.from([0x6f, 0xde]));
            expect(Buffer.from(stub.getCall(1).args[0].data)).to.deep.equal(Buffer.from([0xef, 0x0f, 0x00, 0x01, 0x6f, 0xde, 0xad, 0xbe]));
        });

        it('does not add redundancy for the first packet on the third packet', () => {
            const stub = sinon.stub();
            encoder.addRedundancy({
                data: new Uint8Array([0xde]),
                timestamp: 0,
            }, {enqueue: stub});
            encoder.addRedundancy({
                data: new Uint8Array([0xad, 0xbe]),
                timestamp: 960,
            }, {enqueue: stub});
            encoder.addRedundancy({
                data: new Uint8Array([0xef, 0xff, 0xff]),
                timestamp: 1920,
            }, {enqueue: stub});

            expect(stub.callCount).to.equal(3);
            expect(Buffer.from(stub.getCall(0).args[0].data)).to.deep.equal(Buffer.from([0x6f, 0xde]));
            expect(Buffer.from(stub.getCall(1).args[0].data)).to.deep.equal(Buffer.from([0xef, 0x0f, 0x00, 0x01, 0x6f, 0xde, 0xad, 0xbe]));
            expect(Buffer.from(stub.getCall(2).args[0].data)).to.deep.equal(Buffer.from([0xef, 0x0f, 0x00, 0x02, 0x6f, 0xad, 0xbe, 0xef, 0xff, 0xff]));
        });

        it('does not add redundancy for DTX packets with a 400ms timestamp gap', () => {
            const stub = sinon.stub();
            encoder.addRedundancy({
                data: new Uint8Array([0xde]),
                timestamp: 0,
            }, {enqueue: stub});
            encoder.addRedundancy({
                data: new Uint8Array([0xad, 0xbe]),
                timestamp: 19200,
            }, {enqueue: stub});
            encoder.addRedundancy({
                data: new Uint8Array([0xef, 0xff, 0xff]),
                timestamp: 20160,
            }, {enqueue: stub});
            expect(stub.callCount).to.equal(3);
            expect(Buffer.from(stub.getCall(0).args[0].data)).to.deep.equal(Buffer.from([0x6f, 0xde]));
            expect(Buffer.from(stub.getCall(1).args[0].data)).to.deep.equal(Buffer.from([0x6f, 0xad, 0xbe]));
            expect(Buffer.from(stub.getCall(2).args[0].data)).to.deep.equal(Buffer.from([0xef, 0x0f, 0x00, 0x02, 0x6f, 0xad, 0xbe, 0xef, 0xff, 0xff]));
        });
        */
    });

    /*
    describe('addRedundancy with a redundancy of 2', () => {
        beforeEach(() => {
            encoder.setRedundancy(2);
        });
        it('adds redundancy on the first, second and third packet', () => {
            const stub = sinon.stub();
            encoder.addRedundancy({
                data: new Uint8Array([0xde]),
                timestamp: 0,
            }, {enqueue: stub});
            encoder.addRedundancy({
                data: new Uint8Array([0xad, 0xbe]),
                timestamp: 960,
            }, {enqueue: stub});
            encoder.addRedundancy({
                data: new Uint8Array([0xef, 0xff, 0xff]),
                timestamp: 1920,
            }, {enqueue: stub});

            expect(stub.callCount).to.equal(3);
            expect(Buffer.from(stub.getCall(0).args[0].data)).to.deep.equal(Buffer.from([0x6f, 0xde]));
            expect(Buffer.from(stub.getCall(1).args[0].data)).to.deep.equal(Buffer.from([0xef, 0x0f, 0x00, 0x01, 0x6f, 0xde, 0xad, 0xbe]));
            expect(Buffer.from(stub.getCall(2).args[0].data)).to.deep.equal(Buffer.from([0xef, 0x1e, 0x00, 0x01, 0xef, 0x0f, 0x00, 0x02, 0x6f, 0xde, 0xad, 0xbe, 0xef, 0xff, 0xff]));
        });

        it('does not add redundancy for the first packet on the fourth packet', () => {
            const stub = sinon.stub();
            encoder.addRedundancy({
                data: new Uint8Array([0xde]),
                timestamp: 0,
            }, {enqueue: stub});
            encoder.addRedundancy({
                data: new Uint8Array([0xad, 0xbe]),
                timestamp: 960,
            }, {enqueue: stub});
            encoder.addRedundancy({
                data: new Uint8Array([0xef, 0xff, 0xff]),
                timestamp: 1920,
            }, {enqueue: stub});
            encoder.addRedundancy({
                data: new Uint8Array([0xfa, 0x1f, 0xfa, 0x1f]),
                timestamp: 2880,
            }, {enqueue: stub});

            expect(stub.callCount).to.equal(4);
            expect(Buffer.from(stub.getCall(0).args[0].data)).to.deep.equal(Buffer.from([0x6f, 0xde]));
            expect(Buffer.from(stub.getCall(1).args[0].data)).to.deep.equal(Buffer.from([0xef, 0x0f, 0x00, 0x01, 0x6f, 0xde, 0xad, 0xbe]));
            expect(Buffer.from(stub.getCall(2).args[0].data)).to.deep.equal(Buffer.from([0xef, 0x1e, 0x00, 0x01, 0xef, 0x0f, 0x00, 0x02, 0x6f, 0xde, 0xad, 0xbe, 0xef, 0xff, 0xff]));
            expect(Buffer.from(stub.getCall(3).args[0].data)).to.deep.equal(Buffer.from([0xef, 0x1e, 0x00, 0x02, 0xef, 0x0f, 0x00, 0x03, 0x6f, 0xad, 0xbe, 0xef, 0xff, 0xff, 0xfa, 0x1f, 0xfa, 0x1f]));
        });
    });

    describe('setRedundancy', () => {
        it('reduces the redundancy', () => {
            const stub = sinon.stub();
            encoder.setRedundancy(2);
            encoder.addRedundancy({
                data: new Uint8Array([0xde]),
                timestamp: 0,
            }, {enqueue: stub});
            encoder.addRedundancy({
                data: new Uint8Array([0xad, 0xbe]),
                timestamp: 960,
            }, {enqueue: stub});
            encoder.setRedundancy(1);
            encoder.addRedundancy({
                data: new Uint8Array([0xef, 0xff, 0xff]),
                timestamp: 1920,
            }, {enqueue: stub});

            expect(stub.callCount).to.equal(3);
            expect(Buffer.from(stub.getCall(0).args[0].data)).to.deep.equal(Buffer.from([0x6f, 0xde]));
            expect(Buffer.from(stub.getCall(1).args[0].data)).to.deep.equal(Buffer.from([0xef, 0x0f, 0x00, 0x01, 0x6f, 0xde, 0xad, 0xbe]));
            expect(Buffer.from(stub.getCall(2).args[0].data)).to.deep.equal(Buffer.from([0xef, 0x0f, 0x00, 0x02, 0x6f, 0xad, 0xbe, 0xef, 0xff, 0xff]));
        });

        it('increases the redundancy', () => {
            const stub = sinon.stub();
            encoder.addRedundancy({
                data: new Uint8Array([0xde]),
                timestamp: 0,
            }, {enqueue: stub});
            encoder.setRedundancy(2);
            encoder.addRedundancy({
                data: new Uint8Array([0xad, 0xbe]),
                timestamp: 960,
            }, {enqueue: stub});
            encoder.addRedundancy({
                data: new Uint8Array([0xef, 0xff, 0xff]),
                timestamp: 1920,
            }, {enqueue: stub});

            expect(stub.callCount).to.equal(3);
            expect(Buffer.from(stub.getCall(0).args[0].data)).to.deep.equal(Buffer.from([0x6f, 0xde]));
            expect(Buffer.from(stub.getCall(1).args[0].data)).to.deep.equal(Buffer.from([0xef, 0x0f, 0x00, 0x01, 0x6f, 0xde, 0xad, 0xbe]));
            expect(Buffer.from(stub.getCall(2).args[0].data)).to.deep.equal(Buffer.from([0xef, 0x1e, 0x00, 0x01, 0xef, 0x0f, 0x00, 0x02, 0x6f, 0xde, 0xad, 0xbe, 0xef, 0xff, 0xff]));
        });
    });
    */
});
