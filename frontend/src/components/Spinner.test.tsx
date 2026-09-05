import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import Spinner from "./Spinner";

describe("Spinner", () => {
  it("renders an svg spinner", () => {
    const { container } = render(<Spinner />);
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("applies the default size class when no className is given", () => {
    const { container } = render(<Spinner />);
    expect(container.querySelector("svg")).toHaveClass("h-4", "w-4");
  });

  it("applies a custom className when provided", () => {
    const { container } = render(<Spinner className="h-8 w-8 text-red-500" />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveClass("h-8", "w-8", "text-red-500");
    expect(svg).not.toHaveClass("h-4");
  });

  it("is hidden from assistive technology", () => {
    const { container } = render(<Spinner />);
    expect(container.querySelector("svg")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });
});
