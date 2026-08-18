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
        HTMLElement.prototype.addEventListener = originalAdd;
        HTMLElement.prototype.removeEventListener = originalRemove;
        gridsManager.reset();
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

        api.setGridOption('suppressScrollWhenPopupsAreOpen', false);
        expect(bodyViewportWheelListeners()).toHaveLength(0);
    });
});
