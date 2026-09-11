/** PostgreSQL returns `numeric` columns as strings; expose numbers from entities. */
export const nullableNumericTransformer = {
  to(value: number | null): number | null {
    return value;
  },
  from(value: string | number | null): number | null {
    return value === null ? null : Number(value);
  },
};
