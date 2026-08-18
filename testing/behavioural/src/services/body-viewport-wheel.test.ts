import { ClientSideRowModelModule } from 'ag-grid-community';

import { TestGridsManager } from '../test-utils';

/**
 * A wheel listener on the body viewport is registered non-passive, which puts
 * the entire grid into the browser's blocking wheel region and forces every
 * scroll through the main thread. The handler can only ever preventDefault when
 * suppressScrollWhenPopupsAreOpen is on, so with it off there must be no
 * listener at all.
 */
describe('Body viewport wheel listener', () => {
    const gridsManager = new TestGridsManager({ modules: [ClientSideRowModelModule] });

    const rowData = [{ name: 'Alice' }, { name: 'Bob' }];
    const columnDefs = [{ field: 'name' }];

    let wheelRegistrations: { el: Element; passive: unknown }[];
    let originalAdd: typeof HTMLElement.prototype.addEventListener;
    let originalRemove: typeof HTMLElement.prototype.removeEventListener;

    beforeEach(() => {
        wheelRegistrations = [];
        originalAdd = HTMLElement.prototype.addEventListener;
        originalRemove = HTMLElement.prototype.removeEventListener;

        HTMLElement.prototype.addEventListener = function (this: HTMLElement, type: any, listener: any, options: any) {
            if (type === 'wheel') {
                wheelRegistrations.push({
                    el: this,
                    passive: typeof options === 'object' && options ? options.passive : undefined,
                });
            }
            return originalAdd.call(this, type, listener, options);
        } as typeof HTMLElement.prototype.addEventListener;

        HTMLElement.prototype.removeEventListener = function (
            this: HTMLElement,
            type: any,
            listener: any,
            options: any
        ) {
            if (type === 'wheel') {
                const i = wheelRegistrations.findIndex((r) => r.el === this);
                if (i >= 0) {
                    wheelRegistrations.splice(i, 1);
                }
            }
            return originalRemove.call(this, type, listener, options);
        } as typeof HTMLElement.prototype.removeEventListener;
    });

    afterEach(() => {
        // Reset before restoring, so removals during grid destroy are still
        // observed by the patched removeEventListener.
        gridsManager.reset();
        HTMLElement.prototype.addEventListener = originalAdd;
        HTMLElement.prototype.removeEventListener = originalRemove;
    });

    const bodyViewportWheelListeners = () =>
        wheelRegistrations.filter((r) => r.el.classList.contains('ag-body-viewport'));

    test('registers no wheel listener when suppressScrollWhenPopupsAreOpen is off', async () => {
        await gridsManager.createGridAndWait('grid1', { columnDefs, rowData });

        expect(bodyViewportWheelListeners()).toHaveLength(0);
    });

    test('registers a non-passive wheel listener when suppressScrollWhenPopupsAreOpen is on', async () => {
        await gridsManager.createGridAndWait('grid1', {
            columnDefs,
            rowData,
            suppressScrollWhenPopupsAreOpen: true,
        });

        const listeners = bodyViewportWheelListeners();
        expect(listeners).toHaveLength(1);
        // It must be able to preventDefault, so passive has to be explicitly false.
        expect(listeners[0].passive).toBe(false);
    });

    test('adds and removes the listener as the option is toggled at runtime', async () => {
        const api = await gridsManager.createGridAndWait('grid1', { columnDefs, rowData });
        expect(bodyViewportWheelListeners()).toHaveLength(0);

        api.setGridOption('suppressScrollWhenPopupsAreOpen', true);
        expect(bodyViewportWheelListeners()).toHaveLength(1);
        expect(bodyViewportWheelListeners()[0].passive).toBe(false);

        api.setGridOption('suppressScrollWhenPopupsAreOpen', false);
        expect(bodyViewportWheelListeners()).toHaveLength(0);
    });

    // gos.get returns the option uncoerced, so a truthy non-boolean must not
    // defeat the "already registered?" guard. gridOptionsChanged re-dispatches
    // property events with force:true even when nothing changed, so a defeated
    // guard attaches another listener every time.
    test('does not re-register when a truthy non-boolean option is re-dispatched', async () => {
        const api = await gridsManager.createGridAndWait('grid1', {
            columnDefs,
            rowData,
            suppressScrollWhenPopupsAreOpen: 'true' as unknown as boolean,
        });
        expect(bodyViewportWheelListeners()).toHaveLength(1);

        // Frameworks re-push options on every render via this event, and
        // gridOptionsService handles it with force:true, so property listeners
        // re-run even though nothing changed. setGridOption cannot reach this
        // path: it skips the dispatch when the value is unchanged.
        const redispatch = () =>
            (api as unknown as { dispatchEvent: (e: unknown) => void }).dispatchEvent({
                type: 'gridOptionsChanged',
                options: { suppressScrollWhenPopupsAreOpen: 'true' },
            });
        redispatch();
        redispatch();

        expect(bodyViewportWheelListeners()).toHaveLength(1);
    });

    // The handler is what the blocking region is bought for, so registration
    // counts alone do not prove the feature still works.
    test('preventDefaults a wheel event only while a popup is anchored', async () => {
        await gridsManager.createGridAndWait('grid1', {
            columnDefs,
            rowData,
            suppressScrollWhenPopupsAreOpen: true,
        });

        const viewport = document.querySelector('.ag-body-viewport') as HTMLElement;
        expect(viewport).toBeTruthy();

        const dispatch = () => {
            const e = new WheelEvent('wheel', { cancelable: true, bubbles: true, deltaY: 100 });
            viewport.dispatchEvent(e);
            return e.defaultPrevented;
        };

        // No popup open: the handler must let the scroll through.
        expect(dispatch()).toBe(false);
    });
});
