import { expect, test } from "vitest";
import { parseDkimTagList } from "./utils";

test("parseDkimTagList", () => {
  expect(
    parseDkimTagList(
      " k=rsa;b=c; =foo   ; hello; b=longest_value_for_b; p=DKIM1; p=abcd12345;;;k2=v2"
    )
  ).toStrictEqual({
    k: "rsa",
    p: "abcd12345",
    b: "longest_value_for_b",
    k2: "v2",
  });

  expect(parseDkimTagList("")).toStrictEqual({});

  const tagList = parseDkimTagList("v=1; v=DKIM1; a=b; c=d");
  expect(tagList.a).toBe("b");
  expect(tagList.v).toBe("DKIM1");
  expect(tagList.hasOwnProperty("c")).toBe(true);
  expect(tagList.hasOwnProperty("f")).toBe(false);
});
