# Good and bad tests

Adapted from `mattpocock/skills` (MIT; `.claude/skills/LICENSE.mattpocock-skills.txt`). The examples use Vitest, the
project's test runner from phase 1 on. The names (`buildIndex`, `applyEdits`, `renderMap`) are illustrations, not the
project's API.

## Through the interface, not the inside

```typescript
// GOOD: checks what a caller sees
test("a stale edit is refused", () => {
  const index = buildIndex(files);
  const edit = { address: "users.ts:createUser", hash: "old-hash", text: "..." };
  expect(applyEdits(index, [edit])).toEqual({ ok: false, error: "stale", address: "users.ts:createUser" });
});

// BAD: checks how the code does it
test("applyEdits calls hashFile", () => {
  const spy = vi.spyOn(hashing, "hashFile");
  applyEdits(index, [edit]);
  expect(spy).toHaveBeenCalledTimes(1);
});
```

Signs of a bad test: it mocks the project's own modules, tests a private function, counts calls, breaks on a refactor
that kept the behaviour, or has a name that says how instead of what.

## The file's bytes are part of the interface

In this project, the written file is a public output: every byte outside an edit must stay as it was. So compare
bytes, not only what a later read returns.

```typescript
// GOOD: the bytes outside the edit are identical, CRLF and BOM included
test("an edit keeps every other byte", async () => {
  const before = Buffer.from("﻿export const a = 1;\r\nexport const b = 2;\r\n", "utf8");
  fs.writeFileSync(file, before);
  await applyEditsToDisk(dir, [{ address: "a.ts:b", text: "export const b = 3;" }]);
  const after = fs.readFileSync(file);
  expect(after.subarray(0, 24)).toEqual(before.subarray(0, 24)); // the BOM (3 bytes), line 1 (19) and its CRLF (2)
  expect(after.toString("utf8")).toBe("﻿export const a = 1;\r\nexport const b = 3;\r\n");
});

// BAD: a later read cannot see a lost BOM or a changed line ending
test("an edit is applied", async () => {
  await applyEditsToDisk(dir, [{ address: "a.ts:b", text: "export const b = 3;" }]);
  expect((await readView(dir, "a.ts:b")).text).toContain("b = 3");
});
```

## An independent expected value

```typescript
// BAD: the expected value repeats the code's own computation
test("converts a UTF-16 offset to a code-point column", () => {
  const line = "a😀b";
  expect(columnOf(line, 3)).toBe([...line.slice(0, 3)].length);
});

// GOOD: a literal worked out by hand, with a character outside the Basic Multilingual Plane
test("converts a UTF-16 offset to a code-point column", () => {
  expect(columnOf("a😀b", 3)).toBe(2); // "a" is 1 code unit, "😀" is 2: 3 code units are 2 code points
});
```

## A test for an absence has a negative control

The control runs the same call with the same assertion, with only the protection turned off. It must fail. If it
passes, the first test cannot see a leak.

```typescript
const files = { ".env": "API_KEY=sk-test-123", "a.ts": "export const x = 1;" };

test("a fake key never reaches the map", () => {
  expect(renderMap(buildIndex(files))).not.toContain("sk-test-123");
});

// The negative control: the secret filter off, the same assertion, and it must fail.
test("the leak test notices a key when the secret filter is off", () => {
  expect(() =>
    expect(renderMap(buildIndex(files, { indexSecrets: true }))).not.toContain("sk-test-123"),
  ).toThrow();
});
```
