exports.up = function (knex) {
    return knex.schema
        .alterTable("halopsa_ticket_mapping", function (table) {
            // Change ticket_id from integer to string to preserve leading zeros
            table.string("ticket_id", 50).notNullable().alter();
        });
};

exports.down = function (knex) {
    return knex.schema
        .alterTable("halopsa_ticket_mapping", function (table) {
            // Revert back to integer
            table.integer("ticket_id").notNullable().alter();
        });
};
