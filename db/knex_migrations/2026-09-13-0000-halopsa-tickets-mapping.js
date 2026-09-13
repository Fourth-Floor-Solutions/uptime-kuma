// Mapping table used by the "HaloPSA Tickets" notification provider.
// Guarded with hasTable because instances that ran the Dec-2025 fork
// (alexisskeates/uptime-kuma:halopsa) already have this table.
exports.up = async function (knex) {
    const exists = await knex.schema.hasTable("halopsa_ticket_mapping");
    if (exists) {
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
