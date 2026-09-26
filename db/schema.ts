import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const entries = sqliteTable("entries", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  date: text("date").notNull(),
  time: text("time").notNull(),
  kind: text("kind").notNull(),
  text: text("text").notNull().default(""),
  transcript: text("transcript"),
  audioKey: text("audio_key"),
  duration: integer("duration"),
  sticker: text("sticker"),
}, table => [index("idx_entries_owner_date").on(table.ownerId, table.date)]);

export const todos = sqliteTable("todos", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  text: text("text").notNull(),
  done: integer("done", { mode: "boolean" }).notNull().default(false),
}, table => [index("idx_todos_owner").on(table.ownerId)]);

export const stickers = sqliteTable("stickers", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  mimeType: text("mime_type").notNull(),
}, table => [index("idx_stickers_owner").on(table.ownerId)]);

export const writingBooks = sqliteTable("writing_books", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  title: text("title").notNull(),
  color: text("color").notNull(),
  createdAt: text("created_at").notNull(),
}, table => [index("idx_writing_books_owner").on(table.ownerId, table.createdAt)]);

export const writingMonths = sqliteTable("writing_months", {
  bookId: text("book_id").notNull(),
  ownerId: text("owner_id").notNull(),
  month: text("month").notNull(),
  targetChars: integer("target_chars").notNull().default(0),
  workDays: integer("work_days").notNull().default(0),
}, table => [primaryKey({ columns: [table.bookId, table.month] }), index("idx_writing_months_owner").on(table.ownerId)]);

export const writingDays = sqliteTable("writing_days", {
  bookId: text("book_id").notNull(),
  ownerId: text("owner_id").notNull(),
  date: text("date").notNull(),
  actualChars: integer("actual_chars"),
  worked: integer("worked", { mode: "boolean" }).notNull().default(false),
}, table => [primaryKey({ columns: [table.bookId, table.date] }), index("idx_writing_days_owner_date").on(table.ownerId, table.date)]);
