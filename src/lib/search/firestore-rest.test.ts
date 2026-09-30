import assert from "node:assert/strict";
import { test } from "node:test";
import { buildVectorQuery, decodeFields, docIdFromName, encodeVector } from "./firestore-rest.ts";

test("REST 값을 JS 값으로 바꾼다", () => {
  const out = decodeFields({
    s: { stringValue: "a" },
    i: { integerValue: "42" },
    d: { doubleValue: 0.5 },
    b: { booleanValue: true },
    n: { nullValue: null },
    arr: { arrayValue: { values: [{ stringValue: "S001" }, { stringValue: "S002" }] } },
    empty: { arrayValue: {} },
    m: { mapValue: { fields: { k: { stringValue: "v" } } } },
  });
  assert.deepEqual(out, {
    s: "a",
    i: 42,
    d: 0.5,
    b: true,
    n: null,
    arr: ["S001", "S002"],
    empty: [],
    m: { k: "v" },
  });
});

test("벡터는 __vector__ 표식이 있는 map 으로 보낸다", () => {
  assert.deepEqual(encodeVector([1, 2]), {
    mapValue: {
      fields: {
        __type__: { stringValue: "__vector__" },
        value: { arrayValue: { values: [{ doubleValue: 1 }, { doubleValue: 2 }] } },
      },
    },
  });
});

test("findNearest 질의: 필터 하나는 fieldFilter, 둘 이상은 AND", () => {
  const one = buildVectorQuery({
    collection: "chunks",
    vectorField: "embedding",
    queryVector: [0.1],
    limit: 5,
    filters: [{ field: "project_id", value: "p1" }],
    select: ["text"],
    distanceField: "vector_distance",
  }).structuredQuery as Record<string, any>;
  assert.equal(one.where.fieldFilter.field.fieldPath, "project_id");
  assert.equal(one.findNearest.distanceMeasure, "COSINE");
  assert.equal(one.findNearest.limit, 5);
  assert.deepEqual(one.select.fields, [{ fieldPath: "text" }]);

  const two = buildVectorQuery({
    collection: "chunks",
    vectorField: "embedding",
    queryVector: [0.1],
    limit: 5,
    filters: [
      { field: "a", value: "1" },
      { field: "b", value: "2" },
    ],
    distanceField: "d",
  }).structuredQuery as Record<string, any>;
  assert.equal(two.where.compositeFilter.op, "AND");
  assert.equal(two.select, undefined);

  const none = buildVectorQuery({
    collection: "chunks",
    vectorField: "embedding",
    queryVector: [0.1],
    limit: 5,
    filters: [],
    distanceField: "d",
  }).structuredQuery as Record<string, any>;
  assert.equal(none.where, undefined);
});

test("문서 경로에서 ID 를 꺼낸다", () => {
  assert.equal(docIdFromName("projects/p/databases/(default)/documents/chunks/chk_1"), "chk_1");
});
