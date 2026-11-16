import { describe, expect, it } from "vitest";
import { applyTransform, bindingFields, extractTokens, renderTemplate, resolveBinding, suggestBindings, tokenSyntaxErrors, validateTokens } from "./tokens";

describe("tokens", () => {
  it("extracts unique tokens, tolerating inner whitespace", () => {
    expect(extractTokens("{{ First }} {{Last}} {{First}}")).toEqual(["First", "Last"]);
  });
  it("renders templates; unknown fields become empty", () => {
    expect(renderTemplate("{{First}} {{ Last }}{{Nope}}!", { First: "Anna", Last: "Müller" })).toBe("Anna Müller!");
  });
  it("reports unknown fields and broken braces", () => {
    expect(validateTokens("{{A}} {{B}}", ["A"])).toEqual(["B"]);
    expect(tokenSyntaxErrors("{{A}} {{B")).toEqual(["Unclosed {{ token"]);
    expect(tokenSyntaxErrors("A}}")).toEqual(["}} without matching {{"]);
    expect(tokenSyntaxErrors("{{A}}")).toEqual([]);
  });
  it("resolves bindings with and without a record", () => {
    const field = { mode: "field" as const, field: "Name", template: null };
    const tpl = { mode: "template" as const, field: null, template: "{{A}}-{{B}}" };
    expect(resolveBinding(field, { Name: "Jörg" })).toBe("Jörg");
    expect(resolveBinding(field, null)).toBe("{{Name}}");
    expect(resolveBinding(field, null, "Sample")).toBe("Sample");
    expect(resolveBinding(tpl, { A: "1", B: "2" })).toBe("1-2");
    expect(bindingFields(tpl)).toEqual(["A", "B"]);
  });
  it("transforms case like Python (capitalize after whitespace)", () => {
    expect(applyTransform("anna-maria o'neil", "capitalize")).toBe("Anna-maria O'neil");
    expect(applyTransform("straße", "uppercase")).toBe("STRASSE");
  });
  it("suggests bindings ignoring case, spaces and separators", () => {
    expect(suggestBindings(["first name", "Company"], ["First_Name", "company", "Other"])).toEqual({ "first name": "First_Name", Company: "company" });
  });
});
