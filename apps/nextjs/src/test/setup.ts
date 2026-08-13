import { beforeAll } from "vitest";

beforeAll(() => {
  process.env.DATABASE_URL = process.env.DATABASE_URL ?? "postgres://localhost:5432/atelierone_test";
});
