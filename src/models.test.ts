import { describe, expect, it } from "vitest";
import { contractProblems } from "../test/contract-answers.js";
import { stubModels } from "./models.js";

const idsOf = (count: number) => stubModels(count).models.map((model) => model.id);
const namesOf = (count: number) => stubModels(count).models.map((model) => model.name);

describe("stubModels", () => {
  it("lists stub-model, stub-pro and stub-fast first, named as the stub always named them", () => {
    expect(idsOf(3)).toEqual(["stub-model", "stub-pro", "stub-fast"]);
    expect(namesOf(3)).toEqual(["Stub Default", "Stub Pro", "Stub Fast"]);
  });

  it("numbers every model past the third from its one-based position", () => {
    expect(idsOf(5)).toEqual(["stub-model", "stub-pro", "stub-fast", "stub-4", "stub-5"]);
    expect(namesOf(5).slice(3)).toEqual(["Stub 4", "Stub 5"]);
  });

  it("limits the list to the count, and never to fewer than one model", () => {
    expect(idsOf(1)).toEqual(["stub-model"]);
    expect(idsOf(0)).toEqual(["stub-model"]);
    expect(idsOf(-4)).toEqual(["stub-model"]);
  });

  it("names the first model as the default and conforms to the provider contract", () => {
    const answer = stubModels(3);
    expect(answer.defaultModelId).toBe("stub-model");
    expect(contractProblems("ModelsAnswer", answer)).toEqual([]);
  });
});
