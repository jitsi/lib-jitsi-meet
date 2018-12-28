import SpeakerStats from './SpeakerStats';

describe('SpeakerStats', () => {
    const mockUserId = 1;
    const mockUserName = 'foo';
    let speakerStats;

    beforeEach(() => {
        speakerStats = new SpeakerStats(mockUserId, mockUserName);
    });

    describe('markAsHasLeft', () => {
        it('sets the user state as having left the meeting', () => {
            speakerStats.markAsHasLeft();
            expect(speakerStats.hasLeft()).toBe(true);
        });

        it('removes the user as a dominant speaker', () => {
            speakerStats.setDominantSpeaker(true);
            speakerStats.markAsHasLeft();
            expect(speakerStats.isDominantSpeaker()).toBe(false);
        });
    });

    describe('setDisplayName', () => {
        it('updates the username', () => {
            const newName = `new-${mockUserName}`;

            speakerStats.setDisplayName(newName);
            expect(speakerStats.getDisplayName()).toBe(newName);
        });
    });

    describe('getTotalDominantSpeakerTime', () => {
        const mockDate = new Date(2017, 1, 1);

        beforeEach(() => {
            jasmine.clock().install();
            jasmine.clock().mockDate(mockDate);
        });

        afterEach(() => {
            jasmine.clock().uninstall();
        });

        it('returns the total dominant speaker time', () => {
            const domaintSpeakerEvents = 3;
            const domaintSpeakerTime = 100;

            for (let i = 0; i < domaintSpeakerEvents; i++) {
                speakerStats.setDominantSpeaker(true);
                jasmine.clock().tick(domaintSpeakerTime);
                speakerStats.setDominantSpeaker(false);
            }

            expect(speakerStats.getTotalDominantSpeakerTime())
                .toBe(domaintSpeakerTime * domaintSpeakerEvents);
        });
    });
});
