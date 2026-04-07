import { ClientSideRowModelModule, TextFilterModule, NumberFilterModule, setupAgTestIds } from 'ag-grid-community';
import type { FilterModel } from 'ag-grid-community';

import { GridRows, TestGridsManager, asyncSetTimeout } from '../test-utils';

describe('Controlled Filters', () => {
    const gridsManager = new TestGridsManager({
        modules: [ClientSideRowModelModule, TextFilterModule, NumberFilterModule],
    });

    const rowData = [
        { name: 'Alice', age: 30 },
        { name: 'Bob', age: 25 },
        { name: 'Charlie', age: 35 },
        { name: 'Diana', age: 28 },
    ];

    beforeAll(() => setupAgTestIds());
    afterEach(() => gridsManager.reset());

    describe('Controlled mode (filterModel prop provided)', () => {
        test('filterModel prop filters rows on initialisation', async () => {
            const api = await gridsManager.createGridAndWait('grid1', {
                columnDefs: [
                    { field: 'name', filter: 'agTextColumnFilter' },
                    { field: 'age', filter: 'agNumberColumnFilter' },
                ],
                rowData,
                filterModel: {
                    name: { filterType: 'text', type: 'contains', filter: 'a' },
                },
            });

            // Wait for filters to initialise
            await asyncSetTimeout(0);

            // Should show rows containing 'a' in name: Alice, Charlie, Diana
            const displayedRows = getDisplayedRowData(api);
            expect(displayedRows).toHaveLength(3);
            expect(displayedRows.map((r) => r.name)).toEqual(['Alice', 'Charlie', 'Diana']);
        });

        test('getFilterModel returns the controlled filterModel prop', async () => {
            const controlledModel: FilterModel = {
                name: { filterType: 'text', type: 'equals', filter: 'Bob' },
            };

            const api = await gridsManager.createGridAndWait('grid1', {
                columnDefs: [
                    { field: 'name', filter: 'agTextColumnFilter' },
                    { field: 'age', filter: 'agNumberColumnFilter' },
                ],
                rowData,
                filterModel: controlledModel,
            });

            await asyncSetTimeout(0);

            const result = api.getFilterModel();
            expect(result).toEqual(controlledModel);
        });

        test('isColumnFilterPresent reflects controlled filterModel', async () => {
            const api = await gridsManager.createGridAndWait('grid1', {
                columnDefs: [
                    { field: 'name', filter: 'agTextColumnFilter' },
                    { field: 'age', filter: 'agNumberColumnFilter' },
                ],
                rowData,
                filterModel: {
                    age: { filterType: 'number', type: 'greaterThan', filter: 29 },
                },
            });

            await asyncSetTimeout(0);

            expect(api.isColumnFilterPresent()).toBe(true);
        });

        test('user interaction fires onFilterModelChange instead of updating internal state', async () => {
            const onFilterModelChange = vi.fn();

            const api = await gridsManager.createGridAndWait('grid1', {
                columnDefs: [
                    { field: 'name', filter: 'agTextColumnFilter' },
                    { field: 'age', filter: 'agNumberColumnFilter' },
                ],
                rowData,
                filterModel: {},
                onFilterModelChange,
            });

            await asyncSetTimeout(0);

            // Simulate a filter change via the API (which internally goes through the handler path)
            // In controlled mode, setColumnFilterModel should route through onFilterModelChange
            await api.setColumnFilterModel('name', {
                filterType: 'text',
                type: 'contains',
                filter: 'Bob',
            });

            await asyncSetTimeout(0);

            // The callback should have been called with the proposed model
            expect(onFilterModelChange).toHaveBeenCalled();
            const proposedModel = onFilterModelChange.mock.calls[0][0];
            expect(proposedModel.name).toBeDefined();

            // The grid's internal filter model should NOT have changed (still controlled by prop)
            expect(api.getFilterModel()).toEqual({});

            // All rows should still be displayed since filterModel prop hasn't changed
            const displayedRows = getDisplayedRowData(api);
            expect(displayedRows).toHaveLength(4);
        });

        test('updating filterModel prop triggers filter refresh', async () => {
            const onFilterChanged = vi.fn();

            const api = await gridsManager.createGridAndWait('grid1', {
                columnDefs: [
                    { field: 'name', filter: 'agTextColumnFilter' },
                    { field: 'age', filter: 'agNumberColumnFilter' },
                ],
                rowData,
                filterModel: {},
                onFilterChanged,
            });

            await asyncSetTimeout(0);

            // All rows visible initially
            expect(getDisplayedRowData(api)).toHaveLength(4);

            onFilterChanged.mockClear();

            // Update the filterModel prop
            api.setGridOption('filterModel', {
                age: { filterType: 'number', type: 'greaterThan', filter: 29 },
            });

            await asyncSetTimeout(0);

            // onFilterChanged should have fired
            expect(onFilterChanged).toHaveBeenCalled();

            // Only rows with age > 29 should be displayed: Alice (30), Charlie (35)
            const displayedRows = getDisplayedRowData(api);
            expect(displayedRows).toHaveLength(2);
            expect(displayedRows.map((r) => r.name).sort()).toEqual(['Alice', 'Charlie']);
        });

        test('clearing filterModel removes filters', async () => {
            const api = await gridsManager.createGridAndWait('grid1', {
                columnDefs: [
                    { field: 'name', filter: 'agTextColumnFilter' },
                    { field: 'age', filter: 'agNumberColumnFilter' },
                ],
                rowData,
                filterModel: {
                    name: { filterType: 'text', type: 'equals', filter: 'Alice' },
                },
            });

            await asyncSetTimeout(0);

            // Only Alice should be visible
            expect(getDisplayedRowData(api)).toHaveLength(1);
            expect(getDisplayedRowData(api)[0].name).toBe('Alice');

            // Clear the filter by setting empty model
            api.setGridOption('filterModel', {});

            await asyncSetTimeout(0);

            // All rows should be visible
            expect(getDisplayedRowData(api)).toHaveLength(4);
            expect(api.isColumnFilterPresent()).toBe(false);
        });

        test('multiple filters in controlled model work together', async () => {
            const api = await gridsManager.createGridAndWait('grid1', {
                columnDefs: [
                    { field: 'name', filter: 'agTextColumnFilter' },
                    { field: 'age', filter: 'agNumberColumnFilter' },
                ],
                rowData,
                filterModel: {
                    name: { filterType: 'text', type: 'contains', filter: 'a' },
                    age: { filterType: 'number', type: 'greaterThan', filter: 29 },
                },
            });

            await asyncSetTimeout(0);

            // Name contains 'a' AND age > 29: Alice (30), Charlie (35)
            const displayedRows = getDisplayedRowData(api);
            expect(displayedRows).toHaveLength(2);
            expect(displayedRows.map((r) => r.name).sort()).toEqual(['Alice', 'Charlie']);
        });
    });

    describe('Uncontrolled mode (no filterModel prop)', () => {
        test('standard filter behaviour works without filterModel prop', async () => {
            const api = await gridsManager.createGridAndWait('grid1', {
                columnDefs: [
                    { field: 'name', filter: 'agTextColumnFilter' },
                    { field: 'age', filter: 'agNumberColumnFilter' },
                ],
                rowData,
            });

            await asyncSetTimeout(0);

            // Use the standard API to set a filter
            api.setFilterModel({
                name: { filterType: 'text', type: 'equals', filter: 'Bob' },
            });

            await asyncSetTimeout(0);

            const displayedRows = getDisplayedRowData(api);
            expect(displayedRows).toHaveLength(1);
            expect(displayedRows[0].name).toBe('Bob');
        });

        test('getFilterModel returns internal state in uncontrolled mode', async () => {
            const api = await gridsManager.createGridAndWait('grid1', {
                columnDefs: [
                    { field: 'name', filter: 'agTextColumnFilter' },
                    { field: 'age', filter: 'agNumberColumnFilter' },
                ],
                rowData,
            });

            await asyncSetTimeout(0);

            const model = { name: { filterType: 'text', type: 'equals', filter: 'Alice' } };
            api.setFilterModel(model);

            await asyncSetTimeout(0);

            expect(api.getFilterModel()).toEqual(model);
        });
    });
});

function getDisplayedRowData(api: any): any[] {
    const rows: any[] = [];
    for (let i = 0; i < api.getDisplayedRowCount(); i++) {
        const row = api.getDisplayedRowAtIndex(i);
        if (row?.data) {
            rows.push(row.data);
        }
    }
    return rows;
}
