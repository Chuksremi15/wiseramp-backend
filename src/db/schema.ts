import {
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  serial,
} from "drizzle-orm/pg-core";

// Users table (basic structure for reference)
export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(), // PostgreSQL auto-incremented PK
    name: text("name").notNull(),
    phone: text("phone"),
    email: text("email").notNull(),
    password: text("password"),
    avatar: text("avatar"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    phoneIdx: uniqueIndex("phone_idx").on(table.phone),
    emailIdx: uniqueIndex("email_idx").on(table.email),
  })
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
