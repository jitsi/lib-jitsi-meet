import Listenable from './Listenable';

describe('Listenable', () => {
    let listenable: Listenable;
    let a: jasmine.Spy;
    let b: jasmine.Spy;

    beforeEach(() => {
        listenable = new Listenable();
        a = jasmine.createSpy('a');
        b = jasmine.createSpy('b');
        listenable.addEventListener('a', a);
        listenable.addEventListener('b', b);
    });

    it('removeAllListeners removes only the listeners of the given event', () => {
        listenable.removeAllListeners('a');
        listenable.emit('a');
        listenable.emit('b');

        expect(a).not.toHaveBeenCalled();
        expect(b).toHaveBeenCalled();
    });

    it('removeAllListeners removes the listeners of every event when no event is given', () => {
        listenable.removeAllListeners();
        listenable.emit('a');
        listenable.emit('b');

        expect(a).not.toHaveBeenCalled();
        expect(b).not.toHaveBeenCalled();
    });
});
