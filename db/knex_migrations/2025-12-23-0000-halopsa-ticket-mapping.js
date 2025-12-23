exports.up = function (knex) {
    return knex.schema
        .createTable("halopsa_ticket_mapping", function (table) {
            table.increments("id");
            table.comment("Stores mapping between monitors and HaloPSA tickets for state management");
            table.integer("monitor_id").unsigned().notNullable()
                .references("id").inTable("monitor")
                .onDelete("CASCADE")
                .onUpdate("CASCADE");
            table.integer("notification_id").unsigned().notNullable()
                .references("id").inTable("notification")
                .onDelete("CASCADE")
                .onUpdate("CASCADE");
            table.integer("ticket_id").notNullable()
                .comment("HaloPSA ticket ID");
            table.datetime("created_at").notNullable()
                .defaultTo(knex.fn.now());

            table.unique([ "monitor_id", "notification_id" ]);
        });
};

exports.down = function (knex) {
    return knex.schema
        .dropTable("halopsa_ticket_mapping");
};
