import { describe, expect, it } from "vitest";
import { multiParts, toggleMulti } from "@/lib/multi-answer";

const options = ["Diabetes", "High blood pressure (Tekanan Darah Tinggi)", "Obesity"];

describe("multi-answer (D732)", () => {
  it("splits an answer back into its choices", () => {
    expect(multiParts("Diabetes, Obesity")).toEqual(["Diabetes", "Obesity"]);
    expect(multiParts("")).toEqual([]);
  });

  it("ticks and unticks in the question's order", () => {
    const a = toggleMulti("", "Obesity", true, options);
    const b = toggleMulti(a, "Diabetes", true, options);
    expect(b).toBe("Diabetes, Obesity");
    expect(toggleMulti(b, "Obesity", false, options)).toBe("Diabetes");
  });
});
