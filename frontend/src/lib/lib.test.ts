import { describe, expect, it } from "vitest";

import { describeDetails } from "./api";
import { linkCitations, sourceLocation } from "./format";
import { createSSEParser } from "./sse";

describe("createSSEParser", () => {
  it("parses events split across arbitrary chunks", () => {
    const feed = createSSEParser();
    expect(feed('event: sources\ndata: {"sources": []')).toEqual([]);
    expect(feed('}\n\nevent: delta\ndata: {"text": "Hi"}\n\nevent: do')).toEqual([
      { event: "sources", data: { sources: [] } },
      { event: "delta", data: { text: "Hi" } },
    ]);
    expect(feed('ne\ndata: {"cited": [1]}\n\n')).toEqual([{ event: "done", data: { cited: [1] } }]);
  });

  it("handles CRLF line endings", () => {
    expect(createSSEParser()('event: delta\r\ndata: {"text":"x"}\r\n\r\n')).toEqual([{ event: "delta", data: { text: "x" } }]);
  });
});

describe("linkCitations", () => {
  it("links only known source numbers and leaves real links alone", () => {
    expect(linkCitations("Refunds take 30 days [1][2]. See [3] and [x](http://a).", [1, 2])).toBe(
      "Refunds take 30 days [1](#cite-1)[2](#cite-2). See [3] and [x](http://a).",
    );
  });
});

describe("describeDetails", () => {
  it("flattens DRF validation errors into a sentence", () => {
    expect(describeDetails({ file: ["Unsupported file type."], non_field_errors: ["Bad."] })).toBe(
      "File: Unsupported file type. Bad.",
    );
    expect(describeDetails("Plain message")).toBe("Plain message");
  });
});

describe("sourceLocation", () => {
  it("prefers page, then section", () => {
    expect(sourceLocation({ page: 4, section: "Intro" })).toBe("Page 4");
    expect(sourceLocation({ page: null, section: "Intro" })).toBe("Intro");
    expect(sourceLocation({ page: null, section: null })).toBeNull();
  });
});
