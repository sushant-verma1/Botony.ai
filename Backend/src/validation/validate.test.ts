import { describe, it, expect } from "vitest";
import {
  createUserSchema,
  loginSchema,
  createConversationSchema,
  createMessageSchema,
  renameConversationSchema,
} from "./validate.js";

describe("createUserSchema", () => {
  const validPayload = {
    email: "jane@example.com",
    password: "password123",
    firstName: "Jane",
    lastName: "Doe",
    age: 20,
  };

  it("accepts a valid payload", () => {
    const { error } = createUserSchema.validate(validPayload);
    expect(error).toBeUndefined();
  });

  it("defaults plan to ADVISOR when omitted", () => {
    const { value } = createUserSchema.validate(validPayload);
    expect(value.plan).toBe("ADVISOR");
  });

  it.each(["email", "password", "firstName", "lastName", "age"])(
    "rejects a payload missing %s",
    (field) => {
      const payload = { ...validPayload };
      delete (payload as Record<string, unknown>)[field];
      const { error } = createUserSchema.validate(payload);
      expect(error).toBeDefined();
    },
  );

  it("rejects a password shorter than 8 characters", () => {
    const { error } = createUserSchema.validate({
      ...validPayload,
      password: "short",
    });
    expect(error).toBeDefined();
  });

  it("rejects an age under 13", () => {
    const { error } = createUserSchema.validate({ ...validPayload, age: 10 });
    expect(error).toBeDefined();
  });

  it("rejects an age over 120", () => {
    const { error } = createUserSchema.validate({
      ...validPayload,
      age: 200,
    });
    expect(error).toBeDefined();
  });

  it("rejects an invalid email format", () => {
    const { error } = createUserSchema.validate({
      ...validPayload,
      email: "not-an-email",
    });
    expect(error).toBeDefined();
  });
});

describe("loginSchema", () => {
  it("accepts a valid payload", () => {
    const { error } = loginSchema.validate({
      email: "jane@example.com",
      password: "password123",
    });
    expect(error).toBeUndefined();
  });

  it("rejects a missing email", () => {
    const { error } = loginSchema.validate({ password: "password123" });
    expect(error).toBeDefined();
  });

  it("rejects a missing password", () => {
    const { error } = loginSchema.validate({ email: "jane@example.com" });
    expect(error).toBeDefined();
  });

  it("rejects a password shorter than 8 characters", () => {
    const { error } = loginSchema.validate({
      email: "jane@example.com",
      password: "short",
    });
    expect(error).toBeDefined();
  });
});

describe("createConversationSchema", () => {
  it("accepts an empty payload (title optional, status defaulted)", () => {
    const { error, value } = createConversationSchema.validate({});
    expect(error).toBeUndefined();
    expect(value.status).toBe("ONGOING");
  });

  it("rejects a title longer than 100 characters", () => {
    const { error } = createConversationSchema.validate({
      title: "a".repeat(101),
    });
    expect(error).toBeDefined();
  });

  it("rejects an invalid status value", () => {
    const { error } = createConversationSchema.validate({
      status: "ARCHIVED",
    });
    expect(error).toBeDefined();
  });
});

describe("createMessageSchema", () => {
  it("accepts valid content", () => {
    const { error } = createMessageSchema.validate({ content: "Hello" });
    expect(error).toBeUndefined();
  });

  it("rejects empty content", () => {
    const { error } = createMessageSchema.validate({ content: "" });
    expect(error).toBeDefined();
  });

  it("rejects content longer than 3000 characters", () => {
    const { error } = createMessageSchema.validate({
      content: "a".repeat(3001),
    });
    expect(error).toBeDefined();
  });

  it("accepts content at exactly the 3000 character limit", () => {
    const { error } = createMessageSchema.validate({
      content: "a".repeat(3000),
    });
    expect(error).toBeUndefined();
  });
});

describe("renameConversationSchema", () => {
  it("accepts a valid title", () => {
    const { error } = renameConversationSchema.validate({
      title: "New title",
    });
    expect(error).toBeUndefined();
  });

  it("trims whitespace from the title", () => {
    const { value } = renameConversationSchema.validate({
      title: "  New title  ",
    });
    expect(value.title).toBe("New title");
  });

  it("rejects an empty title", () => {
    const { error } = renameConversationSchema.validate({ title: "" });
    expect(error).toBeDefined();
  });

  it("rejects a missing title", () => {
    const { error } = renameConversationSchema.validate({});
    expect(error).toBeDefined();
  });

  it("rejects a title longer than 100 characters", () => {
    const { error } = renameConversationSchema.validate({
      title: "a".repeat(101),
    });
    expect(error).toBeDefined();
  });
});
