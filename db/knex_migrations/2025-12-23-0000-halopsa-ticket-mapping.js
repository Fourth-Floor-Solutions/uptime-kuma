exports.up = function (knex) {
    return knex.schema
        .createTable("halopsa_ticket_mapping", function (table) {
            table.increments("id");
            table.comment("Stores mapping between monitors and HaloPSA tickets for state management");
            table.integer("monitor_id").unsigned().notNullable()
                .references("id").inTable("monitor")
                .onDelete("CASCADE")
                .onUpdate("CASCADE");
            table.string("tenant_url", 255).notNullable()
                .comment("HaloPSA tenant URL to identify which HaloPSA instance");
            table.integer("ticket_id").notNullable()
                .comment("HaloPSA ticket ID");
            table.datetime("created_at").notNullable()
                .defaultTo(knex.fn.now());

            table.unique([ "monitor_id", "tenant_url" ]);
        });
};

exports.down = function (knex) {
    return knex.schema
        .dropTable("halopsa_ticket_mapping");
};
