import { describe, expect, it } from "vitest";
import {
  acceptSetupFile, cleanFileName, contentTypeFor, formatBytes, isSetupFilePath, itemStatus, setupFilePath, toHubFile,
} from "@/features/setup/hub";

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

describe("acceptSetupFile (D459)", () => {
  it("takes office files and photos, typed by their extension", () => {
    expect(acceptSetupFile({ name: "Rooms.XLSX", size: 10 })).toEqual({ ok: true, ext: "xlsx", contentType: XLSX });
    expect(acceptSetupFile({ name: "list.csv", size: 10 })).toMatchObject({ ok: true, contentType: "text/csv" });
    expect(acceptSetupFile({ name: "photo.jpeg", size: 10 })).toMatchObject({ ok: true, ext: "jpg", contentType: "image/jpeg" });
  });
  it("refuses other types, empty files and files over 25 MB", () => {
    expect(acceptSetupFile({ name: "plan.svg", size: 10 }).ok).toBe(false);
    expect(acceptSetupFile({ name: "noext", size: 10 }).ok).toBe(false);
    expect(acceptSetupFile({ name: "a.pdf", size: 0 })).toEqual({ ok: false, message: "That file is empty." });
    expect(acceptSetupFile({ name: "a.pdf", size: 25 * 1024 * 1024 + 1 })).toEqual({ ok: false, message: "Files must be 25 MB or smaller." });
  });
  it("reads the type back from a stored path", () => {
    expect(contentTypeFor("o/e/abc.xlsx")).toBe(XLSX);
    expect(contentTypeFor("o/e/abc.exe")).toBeNull();
  });
  it("refuses object-prototype names, which are not file types", () => {
    expect(acceptSetupFile({ name: "a.constructor", size: 10 }).ok).toBe(false);
    expect(contentTypeFor("o/e/abc.constructor")).toBeNull();
  });
});

describe("cleanFileName", () => {
  it("keeps the file's own name, without folders or control characters", () => {
    expect(cleanFileName("C:\\fakepath\\Rooms.xlsx")).toBe("Rooms.xlsx");
    expect(cleanFileName('a\u0007"b.pdf')).toBe("ab.pdf");
    expect(cleanFileName("   ")).toBe("file");
  });
  it("keeps the end of a long name, so the extension survives", () => {
    const long = `${"x".repeat(300)}.pdf`;
    expect(cleanFileName(long)).toHaveLength(200);
    expect(cleanFileName(long).endsWith(".pdf")).toBe(true);
  });
});

describe("setup file paths", () => {
  const id = "0b9a2f1e-1c2d-4e5f-8a9b-0c1d2e3f4a5b";
  it("are minted under the event's folder", () => {
    expect(setupFilePath("o", "e", id, "pdf")).toBe(`o/e/${id}.pdf`);
    expect(isSetupFilePath(`o/e/${id}.pdf`, "o", "e")).toBe(true);
  });
  it("refuses anything else", () => {
    expect(isSetupFilePath(`o/x/${id}.pdf`, "o", "e")).toBe(false);
    expect(isSetupFilePath("o/e/../secret.pdf", "o", "e")).toBe(false);
    expect(isSetupFilePath(`o/e/sub/${id}.pdf`, "o", "e")).toBe(false);
  });
});

describe("itemStatus (D458)", () => {
  const at = (s: string) => `2026-10-11T0${s}:00:00+00:00`;
  it("is empty with no files and no note", () => {
    expect(itemStatus(null, 0)).toBe("empty");
    expect(itemStatus({ notes: "  ", updated_at: at("1"), handled_at: null }, 0)).toBe("empty");
  });
  it("is new until the admin marks it handled, and again after any change", () => {
    expect(itemStatus({ notes: "Hi", updated_at: at("1"), handled_at: null }, 0)).toBe("new");
    expect(itemStatus(null, 2)).toBe("new");
    expect(itemStatus({ notes: "", updated_at: at("1"), handled_at: at("2") }, 1)).toBe("handled");
    expect(itemStatus({ notes: "", updated_at: at("3"), handled_at: at("2") }, 1)).toBe("new");
  });
});

describe("toHubFile and formatBytes", () => {
  it("shows the browser only what it needs, never the storage path", () => {
    expect(toHubFile({ id: "f", name: "a.pdf", size_bytes: 5, uploaded_at: "t", path: "o/e/x.pdf" } as never)).toEqual({ id: "f", name: "a.pdf", size_bytes: 5, uploaded_at: "t" });
  });
  it("prints sizes", () => {
    expect(formatBytes(500)).toBe("500 B");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(5.5 * 1024 * 1024)).toBe("5.5 MB");
  });
});
