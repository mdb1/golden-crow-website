/**
 * @jest-environment jsdom
 */

// data-table.test.tsx
//
// The shared table behind the MyDNAMap admin lists (users, gym members,
// community posts, reports). Migrated from TanStack Table v8 to v9, where no
// feature is on by default — a feature left unregistered doesn't throw, it just
// silently stops working (no search, no paging). This pins what the lists do.

import "@testing-library/jest-dom";

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { DataTable, type DataTableColumnDef } from "@/components/ui/data-table";

type Person = { name: string; city: string; age: number };

const columns: DataTableColumnDef<Person>[] = [
  { accessorKey: "name", header: "Name" },
  { accessorKey: "city", header: "City" },
  { accessorKey: "age", header: "Age" },
];

const people: Person[] = Array.from({ length: 45 }, (_, i) => ({
  name: `Person ${String(i + 1).padStart(2, "0")}`,
  city: i % 2 === 0 ? "Rosario" : "Córdoba",
  age: 20 + i,
}));

function bodyRows() {
  // header row excluded
  return screen.getAllByRole("row").slice(1);
}

describe("DataTable (TanStack Table v9)", () => {
  it("renders headers and the first page of 20 rows", () => {
    render(<DataTable columns={columns} data={people} />);

    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(bodyRows()).toHaveLength(20);
    expect(screen.getByText("Person 01")).toBeInTheDocument();
    expect(screen.queryByText("Person 21")).not.toBeInTheDocument();
    expect(screen.getByText(/Page 1 of 3/)).toBeInTheDocument();
  });

  it("pages forward and back", async () => {
    const user = userEvent.setup();
    render(<DataTable columns={columns} data={people} />);

    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Person 21")).toBeInTheDocument();
    expect(screen.getByText(/Page 2 of 3/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(bodyRows()).toHaveLength(5);
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Previous" }));
    expect(screen.getByText(/Page 2 of 3/)).toBeInTheDocument();
  });

  it("filters across every column from the search box (strings and numbers)", async () => {
    const user = userEvent.setup();
    render(<DataTable columns={columns} data={people} filterKey="name" filterPlaceholder="Search" />);

    await user.type(screen.getByPlaceholderText("Search"), "Person 07");
    expect(bodyRows()).toHaveLength(1);
    expect(screen.getByText("Person 07")).toBeInTheDocument();

    await user.clear(screen.getByPlaceholderText("Search"));
    await user.type(screen.getByPlaceholderText("Search"), "córdoba");
    expect(screen.getByText(/Page 1 of 2/)).toBeInTheDocument(); // 22 matches
  });

  it("shows the empty state", () => {
    render(<DataTable columns={columns} data={[]} />);
    expect(screen.getByText("No results.")).toBeInTheDocument();
  });
});
