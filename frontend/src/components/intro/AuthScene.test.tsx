import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import AuthScene from "./AuthScene";
import Login from "../Login";
import { EYE, IDLE, shutScale } from "./introConfig";

vi.mock("../../context/AuthContext", () => ({
  useAuth: () => ({ login: vi.fn() }),
}));

/** The lid position anime has left on an eye, whatever else is written to the
 *  same transform (the pointer look writes translations to these too). */
function lid(eye: Element) {
  const scaleY = /scaleY\(([-\d.]+)\)/.exec(eye.getAttribute("style") ?? "");
  return scaleY ? Number(scaleY[1]) : 1;
}

function renderScene() {
  const view = render(
    <MemoryRouter initialEntries={[{ pathname: "/login", state: { fromIntro: true } }]}>
      <Routes>
        <Route element={<AuthScene />}>
          <Route path="/login" element={<Login />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
  return { ...view, eye: () => view.container.querySelector(".hero__eye")! };
}

describe("AuthScene eyes", () => {
  it("shuts them while the password field is hovered, and opens them after", async () => {
    const { eye } = renderScene();
    const field = screen.getByLabelText(/^password$/i).closest("[data-secret]")!;

    fireEvent.pointerOver(field);
    // Asserted inside the waitFor, not after it: the lid is mid-drop for
    // IDLE.blinkClose, so a poll can catch it on the way down.
    await waitFor(() => expect(lid(eye())).toBeCloseTo(shutScale, 2));
    // The shut pair is exactly as tall as the bar between them.
    expect(lid(eye()) * EYE.R * 2).toBeCloseTo(EYE.BAR_H, 3);

    fireEvent.pointerOver(screen.getByLabelText(/email/i));
    await waitFor(() => expect(lid(eye())).toBe(1));
  });

  it("keeps them shut when the pointer leaves a focused password field", async () => {
    const { eye } = renderScene();
    const password = screen.getByLabelText(/^password$/i);

    fireEvent.pointerOver(password);
    fireEvent.focus(password);
    await waitFor(() => expect(lid(eye())).toBeLessThan(0.5));

    // The mouse wanders off mid-password: the focus is what is still holding
    // them shut, so nothing should open.
    fireEvent.pointerOver(screen.getByLabelText(/email/i));
    await new Promise((resolve) => setTimeout(resolve, IDLE.blinkOpen * 2));
    expect(lid(eye())).toBeLessThan(0.5);
  });
});
