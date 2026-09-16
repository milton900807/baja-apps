function (pt, table) {
    // The operations of an ordinary table: none beyond the table's own menu. The loader
    // (baja/table/table-ops.js) falls back to this file for any table type without an ops
    // file of its own; until it existed, every context-menu open made two 404 requests.
    return {};
}
