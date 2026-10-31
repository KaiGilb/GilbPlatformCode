// Test-only. An editor for the card: the data of the state and one spy for each act, so a test reads what the card was asked to do.
import { vi } from "vitest";
import type { Employment, EmploymentsEditor } from "@kaigilb/gilbplatformcode-employments-state";

export const emp = (over: Partial<Employment> = {}): Employment => ({
  key: "e1",
  company: "Larsen & Co",
  titles: [{ key: "t0", value: "Product lead" }],
  order: 0,
  titlesStored: ["Product lead"],
  role: { start: "2024-03", end: "", current: true, placeId: "", placeLabel: "" },
  ...over,
});

export type SpyEditor = EmploymentsEditor & {
  addEmployment: ReturnType<typeof vi.fn>;
  editEmploymentCompany: ReturnType<typeof vi.fn>;
  deleteEmployment: ReturnType<typeof vi.fn>;
  addJobTitle: ReturnType<typeof vi.fn>;
  editJobTitle: ReturnType<typeof vi.fn>;
  editEmploymentRole: ReturnType<typeof vi.fn>;
  deleteJobTitle: ReturnType<typeof vi.fn>;
  retryOutbox: ReturnType<typeof vi.fn>;
};

export const editor = (employments: Employment[], over: Partial<EmploymentsEditor> = {}): SpyEditor => ({
  employments,
  unresolved: [],
  legacyText: [],
  status: {},
  loading: false,
  error: null,
  addEmployment: vi.fn(() => "e2"),
  editEmploymentCompany: vi.fn(),
  deleteEmployment: vi.fn(),
  addJobTitle: vi.fn(),
  editJobTitle: vi.fn(),
  editEmploymentRole: vi.fn(),
  deleteJobTitle: vi.fn(),
  retryOutbox: vi.fn(),
  ...over,
}) as SpyEditor;

/** The acts of an editor that wrote or asked to write anything. */
export const acts = (e: SpyEditor): number =>
  [e.addEmployment, e.editEmploymentCompany, e.deleteEmployment, e.addJobTitle, e.editJobTitle, e.editEmploymentRole, e.deleteJobTitle, e.retryOutbox].reduce((n, f) => n + f.mock.calls.length, 0);
