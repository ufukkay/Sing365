import { describe, expect, it } from "vitest";
import {
  appendFieldToText,
  canvasText,
  columnsToLine,
  mergeWithNext,
  type Node,
} from "../components/signature-designer-model";

const text = (id: string, t: string, href?: string): Node => ({ id, value: { type: "text", text: t, href } });

describe("quick line editing", () => {
  it("adds a field to the end of a line, with a space between name parts", () => {
    const block = { type: "text" as const, text: "{{given_name}}" };
    expect(appendFieldToText(block, "surname", " · ").text).toBe("{{given_name}} {{surname}}");
    expect(appendFieldToText({ type: "text", text: "{{job_title}}" }, "department", " · ").text).toBe("{{job_title}} · {{department}}");
    expect(appendFieldToText({ type: "text", text: "" }, "email", " · ").text).toBe("{{email}}");
  });

  it("drops the single-field link when fields are combined", () => {
    const block = { type: "text" as const, text: "T: {{business_phone}}", href: "tel:{{business_phone}}" };
    expect(appendFieldToText(block, "mobile_phone", " · ")).toEqual({ type: "text", text: "T: {{business_phone}} · {{mobile_phone}}", href: undefined });
  });

  it("turns a row of one-line columns into one line", () => {
    const row: Node = {
      id: "r",
      columns: [{ nodes: [text("a", "{{given_name}}")] }, { nodes: [text("b", "{{surname}}")] }],
    };
    expect(columnsToLine(row, " · ")).toEqual({ id: "r", value: { type: "text", text: "{{given_name}} {{surname}}", label: undefined, href: undefined } });
    const phones: Node = {
      id: "p",
      columns: [{ nodes: [text("a", "{{business_phone}}", "tel:{{business_phone}}")] }, { nodes: [text("b", "{{mobile_phone}}")] }],
    };
    expect(columnsToLine(phones, " · ")).toMatchObject({ value: { text: "{{business_phone}} · {{mobile_phone}}", href: undefined } });
  });

  it("leaves rows with images or several lines per column alone", () => {
    const image: Node = { id: "r", columns: [{ nodes: [{ id: "i", value: { type: "image", src: "", alt: "x", width: 1, height: 1 } }] }] };
    const stacked: Node = { id: "r", columns: [{ nodes: [text("a", "{{a}}"), text("b", "{{b}}")] }] };
    expect(columnsToLine(image, " · ")).toBeNull();
    expect(columnsToLine(stacked, " · ")).toBeNull();
  });

  it("merges a line with the next one, also inside a column", () => {
    const nodes: Node[] = [text("a", "{{job_title}}"), text("b", "{{department}}"), text("c", "{{email}}")];
    const merged = mergeWithNext(nodes, "a", " | ")!;
    expect(merged.map((n) => ("value" in n && n.value.type === "text" ? n.value.text : ""))).toEqual(["{{job_title}} | {{department}}", "{{email}}"]);
    expect(mergeWithNext(nodes, "c", " | ")).toBeNull();
    const inColumn: Node[] = [{ id: "r", columns: [{ nodes: [text("x", "{{city}}"), text("y", "{{country}}")] }] }];
    const result = mergeWithNext(inColumn, "x", ", ")!;
    expect(result[0]).toMatchObject({ columns: [{ nodes: [{ id: "x", value: { text: "{{city}}, {{country}}" } }] }] });
  });

  it("previews a line without empty parts", () => {
    expect(canvasText("T: {{business_phone}} · M: {{mobile_phone}}", { business_phone: "1", mobile_phone: "" }).value).toBe("T: 1");
  });
});
