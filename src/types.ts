export type FieldType = "string" | "integer" | "number" | "boolean" | "array" | "object";

/** A path or query parameter, or a JSON body field. */
export interface Field {
  name: string;
  in?: "path" | "query" | "header";
  type: FieldType;
  description?: string;
  enum?: string[];
  required: boolean;
  nullable: boolean;
  /** The item type of a body array. */
  items?: FieldType;
}

export interface Operation {
  operationId: string;
  method: string;
  path: string;
  summary: string;
  description?: string;
  tag: string;
  params: Field[];
  body: { fields: Field[] } | null;
  response: "json" | "csv" | "none";
}
