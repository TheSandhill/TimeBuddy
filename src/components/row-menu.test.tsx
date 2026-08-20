import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RowMenu } from "./row-menu";

function showMenu(overrides: Partial<{ disabled: boolean }> = {}) {
  const chosen = vi.fn();
  render(
    <RowMenu
      label="Acme acties"
      items={[
        { label: "Project toevoegen", onClick: chosen },
        { label: "Naam wijzigen", onClick: vi.fn(), disabled: overrides.disabled },
        { label: "Archiveren", onClick: vi.fn() },
      ]}
    />,
  );
  const trigger = screen.getByRole("button", { name: "Acme acties" });
  return { chosen, trigger, open: () => fireEvent.click(trigger) };
}

const items = () => screen.getAllByRole("menuitem");

describe("reaching the row's actions from the keyboard", () => {
  it("puts focus on the first item when the menu opens", () => {
    const { open } = showMenu();
    open();

    expect(items()[0]).toHaveFocus();
  });

  it("walks down and up through the items, wrapping at both ends", () => {
    const { open } = showMenu();
    open();
    const menu = screen.getByRole("menu");

    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(items()[1]).toHaveFocus();

    fireEvent.keyDown(menu, { key: "ArrowDown" });
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(items()[0]).toHaveFocus();

    fireEvent.keyDown(menu, { key: "ArrowUp" });
    expect(items()[2]).toHaveFocus();
  });

  it("jumps to the ends on Home and End", () => {
    const { open } = showMenu();
    open();
    const menu = screen.getByRole("menu");

    fireEvent.keyDown(menu, { key: "End" });
    expect(items()[2]).toHaveFocus();

    fireEvent.keyDown(menu, { key: "Home" });
    expect(items()[0]).toHaveFocus();
  });

  it("steps over an item that is disabled, since nothing can focus one", () => {
    const { open } = showMenu({ disabled: true });
    open();
    const menu = screen.getByRole("menu");

    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(items()[2]).toHaveFocus();
  });

  it("closes on Escape and hands focus back to the trigger", () => {
    const { open, trigger } = showMenu();
    open();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("menu")).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it("hands focus back to the trigger after an item is chosen", () => {
    const { open, trigger, chosen } = showMenu();
    open();

    fireEvent.click(items()[0]);

    expect(chosen).toHaveBeenCalledOnce();
    expect(screen.queryByRole("menu")).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it("leaves focus alone when a click elsewhere dismisses the menu", () => {
    const { open, trigger } = showMenu();
    open();
    const elsewhere = document.createElement("button");
    document.body.append(elsewhere);
    elsewhere.focus();

    fireEvent.mouseDown(elsewhere);

    expect(screen.queryByRole("menu")).toBeNull();
    expect(trigger).not.toHaveFocus();
    elsewhere.remove();
  });
});
