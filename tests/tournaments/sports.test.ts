import { describe, expect, it } from "vitest";
import { readSport } from "@/features/tournaments/lib/sports";

const form = (o: Record<string, string>) => ({
  text: (k: string) => (o[k] ?? "").trim(),
  checked: (k: string) => k in o,
});

describe("readSport (D638)", () => {
  it("reads one number as an exact squad size", () => {
    expect(readSport(form({ name: " Badminton ", size: "2" }))).toEqual({ name: "Badminton", min_size: 2, max_size: 2, result_kind: "score", format: "pools", pool_size: 3, lane_count: 6, games: 4 });
  });
  it("reads a subs range", () => {
    expect(readSport(form({ name: "Futsal", size: "5", subs: "on", max: "7" }))).toEqual({ name: "Futsal", min_size: 5, max_size: 7, result_kind: "score", format: "pools", pool_size: 3, lane_count: 6, games: 4 });
  });
  it("ignores max unless subs is ticked", () => {
    expect(readSport(form({ name: "Futsal", size: "5", max: "7" }))).toEqual({ name: "Futsal", min_size: 5, max_size: 5, result_kind: "score", format: "pools", pool_size: 3, lane_count: 6, games: 4 });
  });
  it("refuses bad input in the organiser's words", () => {
    expect(() => readSport(form({ name: "", size: "2" }))).toThrow("A sport needs a name");
    expect(() => readSport(form({ name: "X", size: "0" }))).toThrow("Squad size must be at least 1");
    expect(() => readSport(form({ name: "X", size: "" }))).toThrow("Squad size must be at least 1");
    expect(() => readSport(form({ name: "X", size: "5", subs: "on", max: "4" }))).toThrow("The most players can't be fewer than the squad size");
    expect(() => readSport(form({ name: "X", size: "31" }))).toThrow("A squad can have at most 30 players");
    expect(() => readSport(form({ name: "X", size: "5", subs: "on", max: "31" }))).toThrow("A squad can have at most 30 players");
    expect(() => readSport(form({ name: "x".repeat(61), size: "2" }))).toThrow("Keep the sport's name to 60 characters");
  });
});

describe("readSport results settings (D653)", () => {
  it("reads the results type, format and pool size", () => {
    expect(readSport(form({ name: "Swimming", size: "4", result_kind: "time", format: "pools", pool_size: "3" }))).toMatchObject({ result_kind: "time", format: "pools", pool_size: 3, lane_count: 6, games: 4 });
    expect(readSport(form({ name: "Darts", size: "1", format: "manual" }))).toMatchObject({ result_kind: "score", format: "manual", pool_size: 3 });
  });
  it("keeps the pool size from 2 to 8", () => {
    expect(() => readSport(form({ name: "X", size: "2", pool_size: "9" }))).toThrow("Pool size must be from 2 to 8.");
    expect(() => readSport(form({ name: "X", size: "2", pool_size: "1" }))).toThrow("Pool size must be from 2 to 8.");
  });
});

describe("readSport lane draw (D860)", () => {
  it("reads a lane draw with its lanes and games, scored", () => {
    expect(readSport(form({ name: "Bowling", size: "4", format: "lanes", lanes: "6", games: "4", result_kind: "time" }))).toEqual({
      name: "Bowling", min_size: 4, max_size: 4, result_kind: "score", format: "lanes", pool_size: 3, lane_count: 6, games: 4,
    });
    expect(readSport(form({ name: "Bowling", size: "4", format: "lanes", lanes: "8", games: "3" }))).toMatchObject({ lane_count: 8, games: 3 });
  });
  it("keeps lanes from 1 to 20 and games from 1 to 10", () => {
    expect(() => readSport(form({ name: "B", size: "4", format: "lanes", lanes: "0", games: "4" }))).toThrow("Lanes must be from 1 to 20.");
    expect(() => readSport(form({ name: "B", size: "4", format: "lanes", lanes: "6", games: "11" }))).toThrow("Games must be from 1 to 10.");
  });
});
