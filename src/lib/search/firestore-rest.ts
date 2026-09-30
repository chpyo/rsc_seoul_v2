/**
 * Firestore REST API 값 변환 (순수 함수).
 * https://firebase.google.com/docs/firestore/reference/rest/v1/Value
 */

export type RestValue = {
  nullValue?: null;
  booleanValue?: boolean;
  integerValue?: string;
  doubleValue?: number;
  timestampValue?: string;
  stringValue?: string;
  referenceValue?: string;
  arrayValue?: { values?: RestValue[] };
  mapValue?: { fields?: Record<string, RestValue> };
};

export function decodeValue(v: RestValue | undefined): unknown {
  if (!v) return null;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("timestampValue" in v) return v.timestampValue;
  if ("referenceValue" in v) return v.referenceValue;
  if ("arrayValue" in v) return (v.arrayValue?.values ?? []).map(decodeValue);
  if ("mapValue" in v) return decodeFields(v.mapValue?.fields);
  return null;
}

export function decodeFields(fields: Record<string, RestValue> | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields ?? {})) out[k] = decodeValue(v);
  return out;
}

/** Firestore 벡터 값 (__type__: "__vector__") */
export function encodeVector(values: number[]): RestValue {
  return {
    mapValue: {
      fields: {
        __type__: { stringValue: "__vector__" },
        value: { arrayValue: { values: values.map((n) => ({ doubleValue: n })) } },
      },
    },
  };
}

export function docIdFromName(name: string): string {
  return name.slice(name.lastIndexOf("/") + 1);
}

export type EqualityFilter = { field: string; value: string };

/** findNearest 가 들어간 runQuery 본문. */
export function buildVectorQuery(input: {
  collection: string;
  vectorField: string;
  queryVector: number[];
  limit: number;
  filters: EqualityFilter[];
  select?: string[];
  distanceField: string;
}) {
  const fieldFilters = input.filters.map((f) => ({
    fieldFilter: { field: { fieldPath: f.field }, op: "EQUAL", value: { stringValue: f.value } },
  }));
  const where =
    fieldFilters.length === 0
      ? undefined
      : fieldFilters.length === 1
        ? fieldFilters[0]
        : { compositeFilter: { op: "AND", filters: fieldFilters } };
  return {
    structuredQuery: {
      from: [{ collectionId: input.collection }],
      ...(where ? { where } : {}),
      ...(input.select
        ? { select: { fields: input.select.map((fieldPath) => ({ fieldPath })) } }
        : {}),
      findNearest: {
        vectorField: { fieldPath: input.vectorField },
        queryVector: encodeVector(input.queryVector),
        distanceMeasure: "COSINE",
        limit: input.limit,
        distanceResultField: input.distanceField,
      },
    },
  };
}
