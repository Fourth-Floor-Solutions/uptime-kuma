// Legacy migration name from the Dec-2025 HaloPSA fork. Databases that ran that
// fork have this name recorded in knex_migrations; knex refuses to run ANY
// migration when a recorded file is missing, so the name must exist here.
// Guarded so it is safe on fresh installs and on databases that already have the table.
exports.up = async function (knex) {
    if (await knex.schema.hasTable("halopsa_ticket_mapping")) {
        return;
    }
    await knex.schema.createTable("halopsa_ticket_mapping", function (table) {
        table.increments("id");
        table.integer("monitor_id").unsigned().notNullable()
            .references("id").inTable("monitor")
            .onDelete("CASCADE")
            .onUpdate("CASCADE");
        table.string("tenant_url", 255).notNullable();
        table.string("ticket_id", 50).notNullable();
        table.datetime("created_at").notNullable().defaultTo(knex.fn.now());
        table.unique([ "monitor_id", "tenant_url" ]);
    });
};

exports.down = function (knex) {
    return knex.schema.dropTableIfExists("halopsa_ticket_mapping");
};
