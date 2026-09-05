import { describe, it, expect } from "vitest";
import Joi from "joi";
import type { Request } from "express";
import { validate } from "./validate.middleware.js";
import { createMockRes, createMockNext } from "../test/mockExpress.js";

const schema = Joi.object({
  name: Joi.string().required(),
  age: Joi.number().integer().min(0).default(0),
});

describe("validate middleware", () => {
  it("calls next() and normalizes req.body when the schema passes", () => {
    const req = { body: { name: "Jane" } } as Request;
    const res = createMockRes();
    const next = createMockNext();

    validate(schema)(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.body).toEqual({ name: "Jane", age: 0 });
    expect(res.status).not.toHaveBeenCalled();
  });

  it("responds with 400 and does not call next() when the schema fails", () => {
    const req = { body: {} } as Request;
    const res = createMockRes();
    const next = createMockNext();

    validate(schema)(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.any(String) }),
    );
  });
});
