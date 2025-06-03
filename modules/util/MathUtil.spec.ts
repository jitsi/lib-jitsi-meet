import { RunningAverage } from './MathUtil';

describe('running average', () => {
    it('should work', () => {
        const rAvg = new RunningAverage();

        // 1 / 1
        rAvg.addNext(1);
        expect(rAvg.getAverage()).toBe(1);

        // 4 / 2
        rAvg.addNext(3);
        expect(rAvg.getAverage()).toBe(2);

        // 6 / 3
        rAvg.addNext(2);
        expect(rAvg.getAverage()).toBe(2);

        // 12 / 4
        rAvg.addNext(6);
        expect(rAvg.getAverage()).toBe(3);

        // 20 / 5
        rAvg.addNext(8);
        expect(rAvg.getAverage()).toBe(4);
    });
});
