/** @jest-environment jsdom */

import { fireEvent, render, screen, within } from "@testing-library/react";
import { PublisherAppColorPicker } from "@/components/publisher-app-color-picker";

describe("PublisherAppColorPicker", () => {
  it("shows a read-only color label and mounts only the selected color picker", () => {
    render(
      <>
        <PublisherAppColorPicker label="Color principal" value="#123ABC" onChange={jest.fn()} />
        <PublisherAppColorPicker label="Color secundario" value="#456DEF" onChange={jest.fn()} />
        <PublisherAppColorPicker label="Color terciario" value="#FEDCBA" onChange={jest.fn()} />
      </>,
    );

    expect(screen.getByText("#123ABC")).toBeTruthy();
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
    expect(document.querySelectorAll('input[type="color"]')).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Editar color principal" }));

    const dialog = screen.getByRole("dialog", { name: "Color principal" });
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(document.querySelectorAll('input[type="color"]')).toHaveLength(1);
    expect(within(dialog).getByLabelText("Elegir color principal")).toHaveValue("#123abc");
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
  });

  it("discards a canceled selection and reopens with the original color", () => {
    const onChange = jest.fn();
    render(<PublisherAppColorPicker label="Color principal" value="#123ABC" onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Editar color principal" }));
    fireEvent.change(screen.getByLabelText("Elegir color principal"), { target: { value: "#aabbcc" } });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.querySelectorAll('input[type="color"]')).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Editar color principal" }));
    expect(screen.getByLabelText("Elegir color principal")).toHaveValue("#123abc");
  });

  it("commits a selected color once in uppercase and closes the individual editor", () => {
    const onChange = jest.fn();
    render(<PublisherAppColorPicker label="Color principal" value="#123ABC" onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Editar color principal" }));
    fireEvent.change(screen.getByLabelText("Elegir color principal"), { target: { value: "#aabbcc" } });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Usar este color" }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("#AABBCC");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.querySelectorAll('input[type="color"]')).toHaveLength(0);
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
  });

  it("does not open the color editor while disabled", () => {
    const onChange = jest.fn();
    render(<PublisherAppColorPicker label="Color principal" value="#123ABC" onChange={onChange} disabled />);

    const editButton = screen.getByRole("button", { name: "Editar color principal" });
    expect(editButton).toBeDisabled();
    fireEvent.click(editButton);

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.querySelectorAll('input[type="color"]')).toHaveLength(0);
    expect(onChange).not.toHaveBeenCalled();
  });
});
