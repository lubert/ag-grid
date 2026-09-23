import { getByTestId } from '@testing-library/dom';
import { userEvent } from '@testing-library/user-event';

import { ClientSideRowModelModule, agTestIdFor, getGridElement, setupAgTestIds } from 'ag-grid-community';
import type { GridApi, SortModelItem } from 'ag-grid-community';

import { TestGridsManager, asyncSetTimeout } from '../test-utils';

describe('Controlled Sort', () => {
    const gridsManager = new TestGridsManager({
        modules: [ClientSideRowModelModule],
    });

    // The order a server sorted them in: not the order of any column.
    const rowData = [
        { name: 'Charlie', age: 35 },
        { name: 'Alice', age: 30 },
        { name: 'Bob', age: 25 },
    ];
    const columnDefs = [{ field: 'name' }, { field: 'age' }];

    beforeAll(() => setupAgTestIds());
    afterEach(() => gridsManager.reset());

    function names(api: GridApi): string[] {
        const out: string[] = [];
        api.forEachNodeAfterFilterAndSort((node) => out.push(node.data.name));
        return out;
    }

    function sorts(api: GridApi): Record<string, string | null | undefined> {
        return Object.fromEntries(api.getColumnState().map((c) => [c.colId, c.sort]));
    }

    async function clickHeader(api: GridApi, colId: string, shift = false) {
        const user = userEvent.setup();
        // wait for test ids to attach
        await asyncSetTimeout(0);
        const cell = getByTestId(getGridElement(api)! as HTMLElement, agTestIdFor.headerCell(colId));
        if (shift) await user.keyboard('{Shift>}');
        await user.click(cell.querySelector('.ag-header-cell-label')!);
        if (shift) await user.keyboard('{/Shift}');
        await asyncSetTimeout(0);
    }

    test('the header shows the sortModel prop, and rows keep rowData order', async () => {
        const api = await gridsManager.createGridAndWait('grid1', {
            columnDefs,
            rowData,
            sortModel: [{ colId: 'name', sort: 'desc' }],
        });

        expect(sorts(api)).toEqual({ name: 'desc', age: null });
        expect(names(api)).toEqual(['Charlie', 'Alice', 'Bob']);
    });

    test('a header click proposes a sort and changes nothing', async () => {
        const onSortModelChange = vi.fn();
        const api = await gridsManager.createGridAndWait('grid1', {
            columnDefs,
            rowData,
            sortModel: [],
            onSortModelChange,
        });

        await clickHeader(api, 'age');

        expect(onSortModelChange).toHaveBeenCalledTimes(1);
        expect(onSortModelChange).toHaveBeenCalledWith([{ colId: 'age', sort: 'asc' }], 'uiColumnSorted');
        expect(sorts(api)).toEqual({ name: null, age: null });
        expect(names(api)).toEqual(['Charlie', 'Alice', 'Bob']);
    });

    test('a click proposes the next direction after the one the prop shows', async () => {
        const onSortModelChange = vi.fn();
        const api = await gridsManager.createGridAndWait('grid1', {
            columnDefs,
            rowData,
            sortModel: [{ colId: 'age', sort: 'asc' }],
            onSortModelChange,
        });

        await clickHeader(api, 'age');
        expect(onSortModelChange).toHaveBeenLastCalledWith([{ colId: 'age', sort: 'desc' }], 'uiColumnSorted');

        api.setGridOption('sortModel', [{ colId: 'age', sort: 'desc' }]);
        await clickHeader(api, 'age');
        expect(onSortModelChange).toHaveBeenLastCalledWith([], 'uiColumnSorted');
    });

    test('a multi-sort click adds to the model, and a single click replaces it', async () => {
        const onSortModelChange = vi.fn();
        const api = await gridsManager.createGridAndWait('grid1', {
            columnDefs,
            rowData,
            sortModel: [{ colId: 'name', sort: 'asc' }],
            onSortModelChange,
        });

        await clickHeader(api, 'age', true);
        expect(onSortModelChange).toHaveBeenLastCalledWith(
            [
                { colId: 'name', sort: 'asc' },
                { colId: 'age', sort: 'asc' },
            ],
            'uiColumnSorted'
        );

        await clickHeader(api, 'age');
        expect(onSortModelChange).toHaveBeenLastCalledWith([{ colId: 'age', sort: 'asc' }], 'uiColumnSorted');
    });

    test('changing the prop moves the indicators, and clearing it clears them', async () => {
        const onSortChanged = vi.fn();
        const api = await gridsManager.createGridAndWait('grid1', {
            columnDefs,
            rowData,
            sortModel: [{ colId: 'name', sort: 'desc' }],
            onSortChanged,
        });

        const next: SortModelItem[] = [
            { colId: 'age', sort: 'asc' },
            { colId: 'name', sort: 'asc' },
        ];
        api.setGridOption('sortModel', next);
        expect(api.getColumnState().map((c) => [c.colId, c.sort, c.sortIndex])).toEqual([
            ['name', 'asc', 1],
            ['age', 'asc', 0],
        ]);
        expect(onSortChanged).toHaveBeenCalledWith(expect.objectContaining({ source: 'gridOptionsChanged' }));

        api.setGridOption('sortModel', []);
        expect(sorts(api)).toEqual({ name: null, age: null });
        expect(names(api)).toEqual(['Charlie', 'Alice', 'Bob']);
    });

    test('column state and column definitions do not change the sort', async () => {
        const api = await gridsManager.createGridAndWait('grid1', {
            columnDefs,
            rowData,
            sortModel: [{ colId: 'name', sort: 'asc' }],
        });

        api.applyColumnState({ state: [{ colId: 'age', sort: 'desc' }], defaultState: { sort: null } });
        expect(sorts(api)).toEqual({ name: 'asc', age: null });

        api.setGridOption('columnDefs', [{ field: 'name' }, { field: 'age', sort: 'desc' }]);
        await asyncSetTimeout(0);
        expect(sorts(api)).toEqual({ name: 'asc', age: null });
        expect(names(api)).toEqual(['Charlie', 'Alice', 'Bob']);
    });

    test('without the prop, the grid sorts as before', async () => {
        const api = await gridsManager.createGridAndWait('grid1', { columnDefs, rowData });

        await clickHeader(api, 'name');

        expect(sorts(api)).toEqual({ name: 'asc', age: null });
        expect(names(api)).toEqual(['Alice', 'Bob', 'Charlie']);
    });
});
